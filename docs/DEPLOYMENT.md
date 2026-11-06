# Deployment runbook

Insight runs on **one EC2 instance behind Answer United's shared load
balancer, `AU-LB`**. The ALB terminates TLS with the `*.answerunited.net`
certificate and forwards `insight.answerunited.net` as plain HTTP to nginx on
the instance, which proxies to Node under PM2. The database is its own RDS
MySQL 8.4 server, `insight-v2`. **The instance never builds anything.** It
runs a compiled release built offline in GitHub Actions and shipped through
S3. This follows TTG's admin-portal, with the ALB in place of certbot.

```
  Route 53  insight.answerunited.net  alias ─► AU-LB (*.answerunited.net, TLS 1.2+)
                                    :80 → 301 https   :443 host rule → target group HTTP:80
                                                     │  health check /api/health
            ┌──────────── EC2 (Amazon Linux 2023 arm64, t4g.small, tag App=insight) ─────────┐
            │ nginx :80 (from the ALB only) ──► Node (PM2) 127.0.0.1:3000                    │
            │   └─ /_nuxt/, /fonts/ served from /opt/insight/current, /_nuxt/ falls back to   │
            │      /opt/insight/previous                                                    │
            └──────────┬───────────────────────────────┬────────────────────────────────────┘
                       │ 3306 (TLS)                     │ outbound HTTPS
                       ▼                                ▼
            RDS MySQL 8.4 insight-v2 (private)      au-api · S3 (call audio) · Amazon SES · SSM

  GitHub Actions ──(OIDC)──► S3 insight/releases/<v>.tar.gz ──► SSM ──► deploy/activate.sh
```

- **No build on the box.** A release is a ~7 MB tarball: `.output/`
  (self-contained, no native modules), `migrate.mjs`, `create-admin.mjs`, the
  migrations, `ecosystem.config.cjs` and `deploy/`. No git, pnpm or source on
  the instance.
- **Builds need no internet.** See [Offline builds](#offline-builds).
- **No local state.** Data is in MySQL and au-api; the box holds only
  `/opt/insight/shared/.env` and can be replaced at any time.
- **One Node process.** The sign-in rate limits are kept in memory, so a second
  process (or instance) would weaken them.

---

## Offline builds

Everything a build downloads is collected once into a **build cache** kept in
S3. The release build then runs inside `docker run --network none`, so a step
that tries to reach the internet fails the release instead of quietly working.

| Piece | Where |
|---|---|
| Make the cache (the only step with internet) | `scripts/build-cache.sh create <out.tar.gz>` |
| Its key | `scripts/build-cache.sh key`: sha256 of `pnpm-lock.yaml`, `pnpm-workspace.yaml`, the Node and pnpm versions |
| Build a release from it, offline | `scripts/build-release.sh <cache-dir> <version> [out-dir]` |
| CI: refresh the cache in S3 | `.github/workflows/build-cache.yml` (on lockfile changes, or by hand) |
| CI: build offline and deploy | `.github/workflows/release.yml` |

The cache (~700 MB) holds:
- the pnpm store from `pnpm fetch`, for Linux and macOS on x64 and arm64 (`supportedArchitectures` in `pnpm-workspace.yaml`);
- pnpm's package metadata. pnpm checks the lockfile against its supply-chain policy on every install, offline included, and needs it;
- pnpm itself. Since pnpm 12 that is a native binary, one per platform, each checked against the npm registry's sha512;
- Node `.node-version` for Linux x64 and arm64, checksum-verified.

Two things that used to need the network and no longer do:
- **Fonts.** `@nuxt/fonts` downloaded them from Google at build time. It's off (`ui.fonts: false`), and the variable woff2 files are committed in `public/fonts/` (all OFL) and declared at the top of `app/assets/css/main.css`.
- **Icons** were already local (`@iconify-json/*`).

Changing a dependency changes the key. Push the lockfile: `build-cache` runs on
that push and uploads the new cache. A release started before it finishes
fails with "No build cache … Run the build-cache workflow". It never falls
back to the network.

Building by hand:

```bash
mkdir cache && tar -xzf insight-build-cache-<key>.tar.gz -C cache
docker run --rm --network none -v "$PWD":/src:ro -v "$PWD/cache":/cache -v "$PWD/dist":/out \
  ubuntu:24.04 bash /src/scripts/build-release.sh /cache v2.0.0 /out
```

The script builds in a scratch copy, never in the checkout, and excludes every
`.env*` file: Nuxt loads `.env` at build time, and nothing from it may be baked in.

---

## 1. AWS, one time

Account `822778518482`, region **us-east-1**, CLI profile `aws-serverless-au`.
Insight shares what the other Answer United apps already use, and adds only
its own pieces:

| Resource | Value |
|---|---|
| VPC | `vpc-31166a54` (default, `172.31.0.0/16`, no NAT gateway) |
| Instance | t4g.small, Name `insight.answerunited.net`, tag `App=insight`, subnet `subnet-d37ca5f8` (us-east-1b, public IP for outbound only) |
| Load balancer | the shared **`AU-LB`**: HTTPS listener rule `insight.answerunited.net` (priority 90) → target group `insight-answerunited-net`. Uses the `*.answerunited.net` certificate already on the listener |
| Security groups | `insight-web` (80 from `AU-LB`'s `BasicWeb` `sg-f689c092`), `insight-db` (3306 from `insight-web`) |
| Database | new RDS MySQL 8.4 `insight-v2` (db.t4g.micro, private, encrypted, 7-day backups), database `insight`. The older `insight` RDS server (MySQL 5.7) belongs to the previous Insight and isn't used |
| DNS | `insight.answerunited.net` alias `A` → `AU-LB`, in the `answerunited.net` zone |
| Bucket | `au-insight-releases` |
| GitHub role | `github-actions-insight-deploy` (trust and permissions in `deploy/aws/github-*.json`) |
| Instance role / profile | `insight-ec2` (`deploy/aws/ec2-*.json`) |
| Mail | SES us-east-1, `answerunited.com` verified, production access |

The steps below create all of that. Run them from the repository root in one
terminal, because later steps use the variables set earlier. Each `create`
fails safely if its resource already exists.

```bash
export AWS_PROFILE=aws-serverless-au AWS_REGION=us-east-1 AWS_PAGER=""
ACCOUNT=822778518482
VPC=vpc-31166a54
SUBNET=subnet-d37ca5f8            # us-east-1b
ALB_SG=sg-f689c092                # AU-LB's BasicWeb group
LISTENER=arn:aws:elasticloadbalancing:us-east-1:822778518482:listener/app/AU-LB/8da43ae6953d5266/1cc78b51b8cc05d8
ZONE=Z06412283HV1Q3LXK772T        # answerunited.net
BUCKET=au-insight-releases
```

### 1. Artifact bucket

```bash
aws s3api create-bucket --bucket $BUCKET
aws s3api put-public-access-block --bucket $BUCKET --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-lifecycle-configuration --bucket $BUCKET --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-build-cache","Status":"Enabled","Filter":{"Prefix":"insight/build-cache/"},"Expiration":{"Days":90}}]}'
```

### 2. GitHub's OIDC provider and the deploy role

```bash
# Older CLIs (before ~2.15) require --thumbprint-list. AWS no longer checks it
# for GitHub (it trusts the endpoint's CA itself); these are the current chain's
# top certificate (Let's Encrypt Root YR) and GitHub's historically published one.
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com \
  --thumbprint-list ab9d0263244dd0326eb67015705a667e79cfe998 6938fd4d98bab03faadb97b34396831e3780aea1
aws iam create-role --role-name github-actions-insight-deploy \
  --assume-role-policy-document file://deploy/aws/github-trust.json \
  --description "GitHub Actions: build and deploy Insight (kurtv-au/insight)"
aws iam put-role-policy --role-name github-actions-insight-deploy \
  --policy-name insight-deploy --policy-document file://deploy/aws/github-permissions.json
```

The repository uses GitHub's immutable subjects
(`repo:kurtv-au@179181883/insight@1436401315:…`, from `gh api
repos/kurtv-au/insight/actions/oidc/customization/sub`). The trust policy
allows the `production` environment (the deploy job), `v*` tags and branches
(the build jobs), and not pull requests.

### 3. Instance role

```bash
aws iam create-role --role-name insight-ec2 \
  --assume-role-policy-document file://deploy/aws/ec2-trust.json \
  --description "Insight EC2 instance: SSM, releases from S3, SES"
aws iam attach-role-policy --role-name insight-ec2 \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name insight-ec2 \
  --policy-name insight-instance --policy-document file://deploy/aws/ec2-permissions.json
aws iam create-instance-profile --instance-profile-name insight-ec2
aws iam add-role-to-instance-profile --instance-profile-name insight-ec2 --role-name insight-ec2
```

### 4. Security groups

```bash
WEB_SG=$(aws ec2 create-security-group --vpc-id $VPC --group-name insight-web \
  --description "Insight: nginx, from AU-LB only" \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=insight-web},{Key=App,Value=insight}]' \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $WEB_SG --protocol tcp --port 80 --source-group $ALB_SG

DB_SG=$(aws ec2 create-security-group --vpc-id $VPC --group-name insight-db \
  --description "Insight MySQL, from insight-web only" \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=insight-db},{Key=App,Value=insight}]' \
  --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $DB_SG --protocol tcp --port 3306 --source-group $WEB_SG
echo "WEB_SG=$WEB_SG DB_SG=$DB_SG"
```

No SSH rule: the instance is reached through SSM Session Manager.

### 5. Database (takes ~10 minutes)

```bash
aws rds create-db-instance --db-instance-identifier insight-v2 \
  --engine mysql --engine-version 8.4.11 --db-instance-class db.t4g.micro \
  --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --db-name insight --master-username insight_admin --manage-master-user-password \
  --vpc-security-group-ids $DB_SG --db-subnet-group-name default \
  --availability-zone us-east-1b --no-publicly-accessible \
  --backup-retention-period 7 --preferred-backup-window 07:00-08:00 \
  --preferred-maintenance-window sun:08:00-sun:09:00 \
  --auto-minor-version-upgrade --deletion-protection --copy-tags-to-snapshot \
  --tags Key=Name,Value=insight-v2 Key=App,Value=insight
```

The admin password is generated and kept in Secrets Manager. Times are UTC,
so backups run at 2–3 AM Eastern. Carry on with the next steps while it builds.

### 6. Instance

```bash
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 \
  --query Parameter.Value --output text)
INSTANCE=$(aws ec2 run-instances --image-id $AMI --instance-type t4g.small \
  --subnet-id $SUBNET --associate-public-ip-address --security-group-ids $WEB_SG \
  --iam-instance-profile Name=insight-ec2 \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=1 \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":16,"VolumeType":"gp3","Encrypted":true}}]' \
  --user-data file://deploy/user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=insight.answerunited.net},{Key=App,Value=insight}]' \
                       'ResourceType=volume,Tags=[{Key=Name,Value=insight.answerunited.net},{Key=App,Value=insight}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "INSTANCE=$INSTANCE"
aws ec2 wait instance-status-ok --instance-ids $INSTANCE
aws ssm describe-instance-information --filters Key=InstanceIds,Values=$INSTANCE \
  --query 'InstanceInformationList[].PingStatus' --output text     # Online
```

If `run-instances` says the instance profile is invalid, IAM hasn't caught up
with step 3 yet; wait a few seconds and run it again. `PingStatus` can take a
couple of minutes to become `Online` after the status checks pass.

**Shell access.** The account's Session Manager preferences run every session
as the OS user `amtelco` (Run As), which exists to track a vendor's work on the
other servers. Insight doesn't have that user, so a plain `start-session`
fails with "RunAs user amtelco does not exist". Don't create it: on the box,
everything you did would be logged as the vendor. Use Insight's own session
document instead. It runs as `ec2-user` (sudo, as on any AL2023 instance) and
logs to CloudWatch like the account default. CloudTrail records who started
each session (the IAM principal).

```bash
aws ssm create-document --name Insight-Session --document-type Session --document-format JSON --content '{
  "schemaVersion": "1.0",
  "description": "Insight admin sessions, as ec2-user, logged like the account default",
  "sessionType": "Standard_Stream",
  "inputs": {
    "runAsEnabled": true, "runAsDefaultUser": "ec2-user", "idleSessionTimeout": "20",
    "cloudWatchLogGroupName": "/ssm/sessions", "cloudWatchEncryptionEnabled": false,
    "cloudWatchStreamingEnabled": true, "s3EncryptionEnabled": true,
    "shellProfile": { "windows": "", "linux": "" }
  }
}'
aws ssm start-session --target $INSTANCE --document-name Insight-Session    # then: sudo -i
```

### 7. Target group and the `AU-LB` rule

```bash
TG=$(aws elbv2 create-target-group --name insight-answerunited-net \
  --protocol HTTP --port 80 --vpc-id $VPC --target-type instance \
  --health-check-protocol HTTP --health-check-path /api/health --matcher HttpCode=200 \
  --health-check-interval-seconds 15 --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 3 \
  --tags Key=App,Value=insight --query 'TargetGroups[0].TargetGroupArn' --output text)
aws elbv2 modify-target-group-attributes --target-group-arn $TG \
  --attributes Key=deregistration_delay.timeout_seconds,Value=30
aws elbv2 register-targets --target-group-arn $TG --targets Id=$INSTANCE
aws elbv2 create-rule --listener-arn $LISTENER --priority 90 \
  --conditions Field=host-header,Values=insight.answerunited.net \
  --actions Type=forward,TargetGroupArn=$TG
```

The target stays unhealthy until nginx is installed (section 5, step 3).
`AU-LB` already has what Insight needs: the `*.answerunited.net` certificate,
an HTTP→HTTPS redirect, `ELBSecurityPolicy-TLS13-1-2-2021-06`, a 420 s idle
timeout, and X-Forwarded-For set to append. Its shared settings are left as
they are.

### 8. DNS

```bash
aws route53 change-resource-record-sets --hosted-zone-id $ZONE --change-batch '{
  "Comment": "Insight on AU-LB",
  "Changes": [{ "Action": "CREATE", "ResourceRecordSet": {
    "Name": "insight.answerunited.net", "Type": "A",
    "AliasTarget": { "HostedZoneId": "Z35SXDOTRQ7X7K",
      "DNSName": "AU-LB-1527803563.us-east-1.elb.amazonaws.com", "EvaluateTargetHealth": false } } }]
}'
```

`Z35SXDOTRQ7X7K` is the hosted zone of us-east-1 load balancers, not of
`answerunited.net`.

### 9. GitHub settings

```bash
gh variable set AWS_REGION --body us-east-1 -R kurtv-au/insight
gh variable set AWS_ROLE_ARN --body arn:aws:iam::822778518482:role/github-actions-insight-deploy -R kurtv-au/insight
gh variable set ARTIFACT_BUCKET --body au-insight-releases -R kurtv-au/insight
gh api -X PUT repos/kurtv-au/insight/environments/production
```

Add required reviewers to the `production` environment on GitHub if deploys
should need approval.

## 2. Database user

The database server is private, so this runs on the instance. You need the
Session Manager plugin locally (`brew install --cask session-manager-plugin`).

On your machine, get the admin password and the endpoint:

```bash
aws rds wait db-instance-available --db-instance-identifier insight-v2
aws rds describe-db-instances --db-instance-identifier insight-v2 \
  --query 'DBInstances[0].[Endpoint.Address,MasterUserSecret.SecretArn]' --output text
aws secretsmanager get-secret-value --secret-id <the secret ARN> \
  --query SecretString --output text           # {"username":"insight_admin","password":"…"}
aws ssm start-session --target $INSTANCE --document-name Insight-Session
```

On the instance, create the app's own user. It has rights only on the
`insight` database, and only over TLS. The script uses Node and mysql2, because
the MariaDB client AL2023 ships can't sign in to MySQL 8.4's default
authentication:

```bash
sudo -i
mkdir -p /tmp/dbsetup && cd /tmp/dbsetup && npm init -y >/dev/null && npm install mysql2@3 >/dev/null
read -rp 'Endpoint: ' DB_HOST; read -rsp 'Admin password: ' ADMIN_PW; echo
APP_PW=$(openssl rand -hex 24); export DB_HOST ADMIN_PW APP_PW
cat > setup.mjs <<'EOF'
import mysql from 'mysql2/promise'
const { DB_HOST, ADMIN_PW, APP_PW } = process.env
const c = await mysql.createConnection({ host: DB_HOST, user: 'insight_admin', password: ADMIN_PW, ssl: 'Amazon RDS' })
await c.query("CREATE USER 'insight'@'%' IDENTIFIED BY ? REQUIRE SSL", [APP_PW])
await c.query("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP ON insight.* TO 'insight'@'%'")
const [[v]] = await c.query('SELECT VERSION() AS version')
console.log('Created the insight user on MySQL', v.version)
await c.end()
EOF
node setup.mjs
echo "NUXT_DATABASE_URL=mysql://insight:$APP_PW@$DB_HOST:3306/insight?ssl=Amazon%20RDS"
cd / && rm -rf /tmp/dbsetup
```

Keep the printed `NUXT_DATABASE_URL` line for the environment file (next
section). The password is hex, so it needs no URL-encoding. The DDL rights are
for migrations, which `deploy/activate.sh` runs on every deploy. `?ssl=Amazon%20RDS`
turns on TLS, verified against mysql2's bundled Amazon RDS CA bundle; the app
and `migrate.mjs` read the URL the same way.

## 3. Email (SES)

Already in place: in SES **us-east-1** (`NUXT_AWS_REGION`), `answerunited.com`
is verified and the account has production access. Sign-in links,
invitations, password resets and the support form all send from
`no-reply@answerunited.com`, which the instance role is limited to. The
`answerunited.com` identity has a default configuration set, `Bounce_Tracking`,
and SES checks the sender's permission on that too, so the role allows both
(`deploy/aws/ec2-permissions.json`). Without it every send fails with an
access error that only appears in the app log, because sign-in emails are sent
after the response.

## 4. Environment file

Open a shell on the instance with SSM Session Manager (`aws ssm start-session
--target i-… --document-name Insight-Session`, then `sudo -i`), and:

```bash
sudo install -m 600 /dev/null /opt/insight/shared/.env
sudo vi /opt/insight/shared/.env
```

```bash
NUXT_DATABASE_URL=mysql://insight:…@insight-v2.….us-east-1.rds.amazonaws.com:3306/insight?ssl=Amazon%20RDS   # printed in section 2
NUXT_SESSION_PASSWORD=…                      # new: openssl rand -hex 32, never the dev one
NUXT_PUBLIC_APP_URL=https://insight.answerunited.net   # builds the links in emails
NUXT_EMAIL_TRANSPORT=ses
NUXT_EMAIL_FROM="Insight <no-reply@answerunited.com>"
NUXT_AWS_REGION=us-east-1
NUXT_SUPPORT_EMAIL=custserv@answerunited.com # receives the support form
NUXT_AU_API_URL=https://api.answerunited.net
NUXT_AU_API_KEY=…                            # the insight-prod key, never a customer's or insight-dev
# no AWS keys: the instance role sends email
```

`activate.sh` refuses to deploy unless the file is mode 600, has every
required key, has a session password of at least 32 characters, and has an
`https://` app URL. Each of those would otherwise only show up later, as
broken sign-ins or 503s.

## 5. First deploy

1. **Build cache.** Run **build-cache** once by hand (Actions → build-cache →
   Run workflow). After that it runs whenever the lockfile changes.
2. **Release.** `package.json` is at `2.0.0`, so push the tag
   `git tag -a v2.0.0 -m "First production release" && git push origin v2.0.0`.
   Or run **release** by hand on a branch, which gives a version like
   `main-<sha>`. The release migrates the empty database, starts Node, and
   checks `/api/health`. nginx isn't installed yet, so this first health check
   covers Node alone, and the ALB target stays unhealthy until step 3.
3. **nginx.** The config arrived with the release. In an SSM session:

   ```bash
   C=/opt/insight/current/deploy
   VPC_CIDR=172.31.0.0/16   # the VPC's CIDR: AU-LB's addresses come from it
   sed -e "s/__DOMAIN__/insight.answerunited.net/g" -e "s#__VPC_CIDR__#$VPC_CIDR#g" \
     $C/nginx/insight.conf | sudo tee /etc/nginx/conf.d/insight.conf
   sudo nginx -t && sudo systemctl enable --now nginx
   sudo install -m 644 $C/logrotate/insight /etc/logrotate.d/insight
   ```

   The target group turns healthy within about 30 s.
4. **Re-run the release** (Actions → release → Re-run). From now on, every
   deploy also checks that `/login` loads through nginx.
5. **The first admin.** In an SSM session:

   ```bash
   cd /opt/insight/current
   sudo node --env-file=/opt/insight/shared/.env create-admin.mjs you@answerunited.com "Your Name"
   ```

   Then open `https://insight.answerunited.net` and choose "Email me a sign-in
   link". The email comes through SES. Add a passkey from the Account page.
6. **Check:**
   - `curl -s https://insight.answerunited.net/api/health` returns `{"ok":true,"version":"v2.0.0"}`;
   - `curl -sI http://insight.answerunited.net` gives a 301 to https;
   - a recording plays and the messages page loads, which proves au-api and S3 are reachable.

**What `activate.sh` does, step by step:**
1. Checks `.env`.
2. Runs `migrate.mjs`.
3. Points `previous` at the old release and `current` at the new one, with atomic symlink swaps.
4. Runs `pm2 startOrRestart`.
5. Waits for `/api/health` to report **the new version**, and for `/login` to load through nginx once `/etc/nginx/conf.d/insight.conf` exists.
6. Keeps the last 5 releases.

If the health check fails, it puts both links back and restarts the old
release, and the workflow fails.

This was rehearsed in an `amazonlinux:2023` container against MySQL 8.4:
- a bad `.env` is refused;
- first deploy, a re-deploy with nginx, and a second deploy;
- a manual rollback;
- a broken release that rolled itself back;
- a `/_nuxt/` file served from `previous`;
- a forged `X-Forwarded-For`, which reached Node as the real address only.

## 6. Operations

### Deploying

Tag `vX.Y.Z` and push it, or run **release** by hand. A tag must match
`"version"` in `package.json` (`v2.1.0` ↔ `2.1.0`), or the release stops
before building. Releases are immutable: a version already in S3 is never
rebuilt. Running the release again for it (a re-run, or by hand for a tag)
deploys the stored tarball, which re-activates it. To ship a change, bump the
version.

A typical release, once `main` has what should ship:

```bash
git switch main && git pull
git switch -c release-2.1.0
npm pkg set version=2.1.0                     # the tag must match it
git commit -am "Release 2.1.0" && git push -u origin release-2.1.0
gh pr create --fill && gh pr merge --merge    # or merge it on GitHub after review
git switch main && git pull
git tag -a v2.1.0 -m "<what's in it>"
git push origin v2.1.0                        # starts the release workflow

gh run watch "$(gh run list --workflow release --limit 1 --json databaseId -q '.[0].databaseId')"
curl -s https://insight.answerunited.net/api/health   # {"ok":true,"version":"v2.1.0"}
```

The workflow prints `activate.sh`'s output: `[migrate] up to date: N
migrations applied`, `OK: Node is serving v2.1.0`, `OK: /login loads through
nginx`, then `=== insight v2.1.0 is live ===`. A failed health check ends
with `v2.1.0 FAILED; v2.0.0 is serving again` and a red run.

If the release changed `pnpm-lock.yaml`, the merge already started
**build-cache**. Let it finish before pushing the tag, or the release fails
with "No build cache … in S3"; re-run it once the cache is up.

To try a branch without tagging it, run **release** by hand: `gh workflow run
release --ref <branch>`. The version is `<branch>-<sha>`.

PM2 restarts Node in place, so a deploy gives a few seconds of 502s from the
ALB while the new process starts. The browser tabs already open keep loading
their scripts, because nginx falls back to the previous release's `/_nuxt/`.

### Rolling back

```bash
sudo ls -1t /opt/insight/releases
sudo bash /opt/insight/current/deploy/rollback.sh <version>
```

No rebuild, no download, no migration. **Migrations are never reversed**, and
run before the switch, so every migration must keep the release before it
working: add columns and tables, and don't drop or rename in the same release
that stops using them.

### Day to day

```bash
sudo pm2 status                       # one process, insight
sudo pm2 logs insight --lines 100     # app logs: /root/.pm2/logs, rotated daily
sudo pm2 monit                        # memory; PM2 restarts the app above 900 MB
cat /opt/insight/current/VERSION
curl -s localhost:3000/api/health     # {"ok":true,"version":"…"}
sudo tail -f /var/log/nginx/access.log
```

### Changing the environment

Edit `/opt/insight/shared/.env`, then run `sudo pm2 restart insight
--update-env`. A new `NUXT_SESSION_PASSWORD` signs everyone out; passkeys and
passwords keep working.

### Replacing the instance

Nothing on it is unique except `shared/.env`. To replace it:
1. Launch a new one as in section 1, step 6.
2. Copy `.env` across.
3. Run **release** for the current version.
4. Install nginx as in section 5, step 3.
5. Register the new instance in the `insight-answerunited-net` target group
   and deregister the old one.

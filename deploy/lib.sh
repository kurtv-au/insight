# shellcheck shell=bash
# Shared by activate.sh and rollback.sh. Sourced, not run.
#
# Layout under $APP_ROOT (default /opt/insight):
#   shared/.env            production env, mode 600, survives every release
#   releases/<version>/    one extracted release tarball each
#   current  -> releases/<version>   what PM2 runs and nginx serves
#   previous -> releases/<version>   the release before; nginx falls back to its
#                                    /_nuxt/ assets so open tabs keep working

APP_ROOT="${APP_ROOT:-/opt/insight}"
ENV_FILE="$APP_ROOT/shared/.env"
export PM2_HOME="${PM2_HOME:-/root/.pm2}"

# Atomically point a symlink at a directory: a reader sees the old target or
# the new one, never a missing link.
point_link() {
  local name="$1" target="$2"
  ln -sfn "$target" "$APP_ROOT/.$name.tmp"
  mv -T "$APP_ROOT/.$name.tmp" "$APP_ROOT/$name"
}

# Where a link points, or nothing if it is not a link. (`readlink -f` alone
# echoes a missing path back, which would read as a release called "previous".)
link_target() {
  if [ -L "$APP_ROOT/$1" ]; then
    readlink -f "$APP_ROOT/$1" || true
  fi
}

restart_app() {
  pm2 startOrRestart "$APP_ROOT/current/ecosystem.config.cjs" --update-env
  pm2 save
}

# The env value, as the app would read it (no quotes, no export).
env_value() {
  sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//'
}

# Refuses an env file that is missing what production needs. Without
# NUXT_APP_SECRET every sign-in fails (Nuxt derives the session key from it),
# and au-api / support fall back to 503s,
# so without this a bad .env would pass the health check and fail for users.
check_env() {
  local missing="" key value
  for key in NUXT_DATABASE_URL NUXT_APP_SECRET NUXT_PUBLIC_APP_URL NUXT_AU_API_KEY NUXT_SUPPORT_EMAIL; do
    [ -n "$(env_value "$key")" ] || missing="$missing $key"
  done
  if [ -n "$missing" ]; then
    echo "ERROR: $ENV_FILE is missing:$missing (docs/DEPLOYMENT.md \"Environment file\")."
    return 1
  fi
  value="$(env_value NUXT_APP_SECRET)"
  if [ "${#value}" -lt 32 ]; then
    echo "ERROR: NUXT_APP_SECRET must be at least 32 characters (openssl rand -hex 32)."
    return 1
  fi
  if [ -n "$(env_value NUXT_SESSION_PASSWORD)" ]; then
    echo "NOTE: NUXT_SESSION_PASSWORD is no longer used (sessions use NUXT_APP_SECRET); remove it from $ENV_FILE."
  fi
  case "$(env_value NUXT_PUBLIC_APP_URL)" in
    https://*) ;;
    *) echo "ERROR: NUXT_PUBLIC_APP_URL must start with https:// (it builds the links in emails)."; return 1 ;;
  esac
}

# Up, serving the expected version, and reachable through nginx once its site
# is installed (before that — the first deploy, which is what delivers the
# nginx config — Node alone is checked). nginx only speaks HTTP: TLS ends at the
# ALB, which sends the public Host and X-Forwarded-Proto: https, so the check
# sends the same.
healthy() {
  local version="$1" body="" site host
  for _ in $(seq 1 45); do
    body="$(curl -fsS -m 2 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
    if printf '%s' "$body" | grep -Fq "\"$version\"" && printf '%s' "$body" | grep -q '"version"'; then
      break
    fi
    body=""
    sleep 1
  done
  if [ -z "$body" ]; then
    echo "ERROR: /api/health did not report version $version within 45s"
    return 1
  fi
  echo "OK: Node is serving $version"

  if [ -f "${NGINX_SITE:-/etc/nginx/conf.d/insight.conf}" ]; then
    site="$(env_value NUXT_PUBLIC_APP_URL)"
    host="${site#*://}"
    host="${host%%/*}"
    if ! curl -fsS -m 5 -o /dev/null -H "Host: $host" -H "X-Forwarded-Proto: https" \
      "http://127.0.0.1:${NGINX_PORT:-80}/login"; then
      echo "ERROR: Node is up but /login does not load through nginx."
      echo "       Check 'nginx -t' and 'systemctl status nginx'."
      return 1
    fi
    echo "OK: /login loads through nginx for $host"
  fi
}

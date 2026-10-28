# Insight

Insight is the web portal for Answer United customers to access their messages and call recordings.

- **Version:** 2.0.0
- **Company:** Answer United, Inc.
- **License:** Proprietary — see [LICENSE](./LICENSE)

## Tech Stack

- [Nuxt 4](https://nuxt.com)
- [Nuxt UI](https://ui.nuxt.com) with [Tailwind CSS](https://tailwindcss.com)
- MySQL 8 with [Drizzle ORM](https://orm.drizzle.team)
- [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) for sessions, passwords and passkeys
- AWS SES for email
- TypeScript, ESLint, pnpm

## Prerequisites

- Node.js 22.18+ (CI uses Node 24)
- pnpm
- Docker (for the local MySQL database), or any MySQL 8 server
- For sending real email: an AWS account with a verified SES sender identity

## Setup

1. Install the dependencies:

   ```bash
   pnpm install
   ```

2. Create your local environment file and fill in the values:

   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |---|---|
   | `NUXT_DATABASE_URL` | MySQL connection string |
   | `NUXT_SESSION_PASSWORD` | Secret for sealing session cookies (32+ characters). Generate one with `openssl rand -hex 32` |
   | `NUXT_PUBLIC_APP_URL` | Public URL of the app, used in email links |
   | `NUXT_EMAIL_TRANSPORT` | `ses` to send through AWS SES, or `console` to print emails to the server log |
   | `NUXT_EMAIL_FROM` | Sender address (must be verified in SES) |
   | `NUXT_SUPPORT_EMAIL` | Address that receives messages from the support form. Replies go to the sender |
   | `NUXT_AWS_REGION` | SES region. Credentials come from the standard AWS chain (env vars, `AWS_PROFILE`, or an IAM role) |
   | `MYSQL_PORT` | Optional host port for the Docker database (default `3306`) |

3. Start MySQL and apply the database migrations:

   ```bash
   docker compose up -d
   pnpm db:migrate
   ```

4. Create the first platform admin:

   ```bash
   pnpm admin:create you@answerunited.com "Your Name"
   ```

## Development

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

Sign in with **Email me a sign-in link**. With `NUXT_EMAIL_TRANSPORT=console`, the link and code are printed in the dev server output.

## Database

The schema lives in `server/db/schema.ts` and migrations in `server/db/migrations`.

```bash
pnpm db:generate  # Generate a migration after changing the schema
pnpm db:migrate   # Apply pending migrations
pnpm db:studio    # Browse the database in Drizzle Studio
```

Commit generated migrations along with the schema change.

## Architecture

**Tenancy.** Each customer account is a *tenant*. Users can belong to several tenants, with a role in each:

| Role | Can |
|---|---|
| Viewer | See the tenant's messages and call recordings |
| Admin | Also invite, remove and change the roles of admins and viewers |
| Owner | Also manage other owners. Every tenant keeps at least one owner |

Answer United staff are **platform admins**. They create tenants and can access every tenant as an owner. There is no self-signup; users join by invitation.

**Tenant status.** A new tenant starts in **Setting up** while Answer United configures it. Inviting the owner is optional at creation and can be done later from the admin page. During setup, invitations can be sent and accepted, but only platform admins can open the tenant. **Go live** (from the admin page or the banner inside the tenant) makes it **Active**. Active tenants can be suspended and reactivated. The rule lives in `canOpenTenant()` (`shared/utils/tenants.ts`).

**Timezones.** Each tenant has a timezone (default US/Eastern), set by its owners and admins on the tenant's Settings page. Users can choose their own on their Account page; until they do, they see each tenant's timezone. Pages format dates through `useTimezone()`, which applies that effective timezone. The list of zones is in `shared/utils/timezones.ts` (stored as IANA IDs, shown as US/Eastern, Canada/Pacific, UTC…).

Tenant pages live under `/t/[slug]`, and tenant APIs under `/api/tenants/[tenantId]`. Every tenant API checks the caller's role with `requireTenantRole()` (`server/utils/auth.ts`). Roles are always read from the database, never from the session cookie.

**Sign-in methods.** Password, emailed one-time link or 6-digit code (valid 15 minutes, 5 attempts), and passkeys (WebAuthn, added from the Account page). Sessions are sealed cookies. Changing a password, resetting it, or choosing **Sign out other devices** bumps the user's `sessionVersion`, which invalidates every other session.

**Legal pages.** `/terms` and `/privacy` are public and use the `legal` layout. They're linked from the sign-in footer, the account menu and the Account page. When the app's data handling changes (new data stored, new providers, analytics), update `app/pages/privacy.vue` and its *Last updated* date.

**Rate limiting.** Auth endpoints are rate limited per IP and per email, using in-memory storage. When running more than one server instance, mount a shared storage driver (such as Redis) at `rate-limit` in the Nitro config.

## Design

Insight shares its "ink" theme with docu-script: ink neutrals, Bricolage Grotesque headings and Spline Sans Mono labels. The primary color, `cobalt`, is the Answer United logo blue (`#16348c`, lightened in dark mode for contrast). Light mode, the default, uses neutral gray and white surfaces; dark mode keeps the ink palette. Each user can switch from the account menu.

- **Tokens** live in `app/assets/css/main.css`: color ramps, fonts, radii, the type scale, app tokens such as `bg-sidebar` and `text-cobalt-text`, and utilities such as `kicker`, `mono-meta` and `hairline`. Prefer the semantic utilities (`bg-default`, `bg-muted`, `bg-elevated`, `text-highlighted`, `text-muted`, `border-default`) so both color modes keep working.
- **Component styles** (pill buttons, cards, modals, inputs) are overridden in `app/app.config.ts`. Fonts are loaded from `nuxt.config.ts`.
- **Shell:** a left icon rail on desktop (`AppRail`) and a bottom tab bar on mobile (`AppTabbar`), sharing their items through `useAppNav()`.
- **Logos:** `AppLogo` shows the full Answer United logo, swapping `public/images/answer-logo-light-mode.png` and `answer-logo-dark-mode.png` by color mode. `AppMark` is the AU square from the favicon, used in the rail. `public/apple-touch-icon.png` is `favicon.ico` resized to 180px and flattened onto white.
- **Primitives:** `PageHeader`, `AuthHeading`, `SectionKicker`, `AsideNote`, `IconTile`, `InkUnderline`, `AppLogo` and `AppMark`. Check these before building new ones.
- ESLint rejects any class Tailwind doesn't know. Add custom styles as an `@utility` in `main.css`.

## Quality Checks

```bash
pnpm lint       # Run ESLint
pnpm typecheck  # Run vue-tsc type checking
```

These also run in CI on every push (see `.github/workflows/ci.yml`).

## Production

Build the application for production:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

See the [Nuxt deployment documentation](https://nuxt.com/docs/getting-started/deployment) for hosting options.

## Dependency Updates

Dependency updates are managed by [Renovate](https://docs.renovatebot.com) (configured in `renovate.json`).

---

© Answer United, Inc. All rights reserved.

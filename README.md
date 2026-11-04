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

**Tenant status.** A new tenant starts in **Setting up** while Answer United configures it. Inviting the owner is optional at creation and can be done later from the admin page. During setup, invitations can be sent and accepted, but only platform admins can open the tenant. **Go live** (from the admin page or the banner inside the tenant) makes it **Active**. Active tenants can be suspended and reactivated. The rule lives in `canOpenTenant()` (`shared/utils/tenants.ts`). Platform admins can also rename a tenant (its slug stays) or delete it from the admin page; deleting asks for the slug to be typed, and removes the tenant with its memberships, invitations, settings and recording account numbers, while users and the recordings in au-api are kept.

**Timezones.** Each tenant has a timezone (default US/Eastern), set by its owners and admins on the tenant's Settings page. Users can choose their own on their Account page; until they do, they see each tenant's timezone. Pages format dates through `useTimezone()`, which applies that effective timezone. The list of zones is in `shared/utils/timezones.ts` (stored as IANA IDs, shown as US/Eastern, Canada/Pacific, UTC…).

**Recordings.** A tenant's recordings come from its *recording account numbers* (usually one), which platform admins connect on the tenant's Settings page; a number can belong to only one tenant. Columns are set at three levels: platform admins choose which are *available* to the tenant (default Timestamp, Caller ID, Duration), owners and admins choose the tenant's *defaults*, and each user picks their own from the Columns menu. Timestamp is always shown. Platform admins also set how many days of *history* the tenant can load (default 365, a rolling window ending now): the server clamps every list to that window and 404s older recordings and their audio, and the date picker won't go further back. The list opens on today, which loads quickest; other ranges, including *Any time* (`?range=all`), are kept in the URL. Every shown column sorts, on the server (newest first by default). The server leaves unavailable fields out of every response, and search and filters only cover available columns. Search matches caller IDs by their digits. Audio is streamed through the server with Range support for seeking and is listen-only (no download); the player draws the waveform from the audio in the browser. Agent initials aren't shown: the recordings API keeps them internal.

Recordings come from au-api's `/v1/recordings` (`server/recordings/au-api.ts`, through the shared `auApiGet()` in `server/utils/auApi.ts`) using this environment's insight key, `NUXT_AU_API_KEY` (`insight-dev` or `insight-prod`, never a customer's key). Each request names the tenant's own account numbers, and au-api returns only those its key also holds, so **every account number connected here must also be on the key** (see au-api's `docs/CUSTOMER_KEYS.md`). Account numbers are client numbers, so digits only. With no key, development falls back to a deterministic mock (`server/recordings/mock.ts`) and production refuses to serve recordings. Both sources sit behind `RecordingSource` in `server/utils/recordings.ts`. A transferred call is listed once per leg, each with its own audio.

**Messages.** The messages page (`/t/[slug]/messages`) shows the fields a platform admin picked from the tenant's *active message script*. The editor is at `/admin/tenants/[id]/message-fields`, linked from the All tenants menu and from section 04 of the tenant's Settings. The admin picks one of the tenant's account numbers. Its active script's field list comes from au-api's `/v1/scripts/active` (au-api parses the script and publishes only field names, labels, control types and list choices), or from a deterministic mock in development (`server/scripts/mock.ts`). The admin then chooses fields, orders them by dragging or with the arrow buttons, and gives each a label, a type (text, long text, number, currency, date, time, date and time, phone, email, yes/no, choice) and a format. A preview renders the result. A field's key is the script's own field name, compared case-insensitively. Saves replace the whole configuration in one transaction (`tenant_message_settings` and `tenant_message_fields`), guarded by a revision number so two admins can't overwrite each other. Every save is compared with the live script:
- fields no longer in it are kept but flagged *Not in script*, and hidden from the messages page unless *Show anyway* is on;
- fields new since the last save are marked *New*;
- a script hint that disagrees with the chosen type gets a notice, but the admin's choice stands.

One formatter, `formatFieldValue()` in `shared/utils/messageFields.ts`, renders values for both the page and the preview. A tenant can show at most 50 active fields, the most au-api returns per request. A field whose name au-api can't request (it must start with a letter or `_` and use only letters, digits, `_ . -`) is flagged *Can't be loaded* in the editor and stays empty.

Message data comes from au-api's `/v1/messages` (`server/messages/au-api.ts`, behind `MessageSource` in `server/utils/messages.ts`) with the same insight key as recordings. Each request names the tenant's account numbers and its visible fields, so au-api returns, and searches, only those fields. A single message (`?m=` deep links) is checked against the tenant's own account numbers in Insight, because the key covers every client. Values arrive as stored strings, and `formatFieldValue()` types them. au-api reads at most 7 days per request, and the first page of a busy week can take about 10 seconds; it then caches the week for a minute, so paging and searching are fast. The page therefore offers ranges of up to 7 days (default today, no *Any time*). A 7-day range across a daylight-saving change is an hour longer, so the server splits it into windows au-api accepts and pages across them. Messages share the tenant's recordings *history* setting. With no key, development uses generated rows (`server/messages/mock.ts`, marked *sample data* under the search) and production returns 503.

Orphan state is decided at save time. If a script later drops a field, the messages page keeps showing it until an admin opens the editor, which flags it, and saves.

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
pnpm test       # Run the Vitest unit tests (test/unit; no database needed)
```

The unit tests import shared modules directly. `test/setup.ts` recreates the `shared/utils` auto-imports. Server handlers are tested with their Nitro auto-imports stubbed (see `test/unit/messageFields.auth.test.ts`).

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

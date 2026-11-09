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

- Node.js 22.18+ (`.node-version` pins what CI, release builds and production use)
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
   | `NUXT_AU_API_URL` | au-api, the source of recordings, message scripts and messages (default `https://api.answerunited.net`) |
   | `NUXT_AU_API_KEY` | This environment's insight key for au-api. Leave it empty in development to use mock data; production returns 503 without it |
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
| Admin | Also invite, remove and change the roles of admins and viewers, and manage message filters |
| Owner | Also manage other owners. Every tenant keeps at least one owner |

Answer United staff are **platform admins**. They create tenants and can access every tenant as an owner. There is no self-signup; users join by invitation.

**Tenant status.** A new tenant starts in **Setting up** while Answer United configures it. Inviting the owner is optional at creation and can be done later from the admin page. During setup, invitations can be sent and accepted, but only platform admins can open the tenant. **Go live** (from the admin page or the banner inside the tenant) makes it **Active**. Active tenants can be suspended and reactivated. The rule lives in `canOpenTenant()` (`shared/utils/tenants.ts`). Platform admins can also rename a tenant (its slug stays) or delete it from the admin page; deleting asks for the slug to be typed, and removes the tenant with its memberships, invitations, settings, message filters and recording account numbers, while users and the recordings in au-api are kept.

**Timezones.** Each tenant has a timezone (default US/Eastern), set by its owners and admins on the tenant's Settings page. Users can choose their own on their Account page; until they do, they see each tenant's timezone. Pages format dates through `useTimezone()`, which applies that effective timezone. The list of zones is in `shared/utils/timezones.ts` (stored as IANA IDs, shown as US/Eastern, Canada/Pacific, UTC…).

**Recordings.** A tenant's recordings come from its *recording account numbers* (usually one), which platform admins connect on the tenant's Settings page; a number can belong to only one tenant. Columns are set at three levels: platform admins choose which are *available* to the tenant (default Timestamp, Caller ID, Duration), owners and admins choose the tenant's *defaults*, and each user picks their own from the Columns menu. Timestamp is always shown. Platform admins also set how many days of *history* the tenant can load (default 365, a rolling window ending now): the server clamps every list to that window and 404s older recordings and their audio, and the date picker won't go further back. The list opens on today, which loads quickest; other ranges, including *Any time* (`?range=all`), are kept in the URL. Every shown column sorts, on the server (newest first by default). The server leaves unavailable fields out of every response, and search and filters only cover available columns. Search matches caller IDs by their digits. Audio is streamed through the server with Range support for seeking and is listen-only (no download); the player draws the waveform from the audio in the browser. Agent initials aren't shown: the recordings API keeps them internal.

Recordings come from au-api's `/v1/recordings` (`server/recordings/au-api.ts`, through the shared `auApiGet()` in `server/utils/auApi.ts`) using this environment's insight key, `NUXT_AU_API_KEY` (`insight-dev` or `insight-prod`, never a customer's key). Each request names the tenant's own account numbers, and au-api returns only those its key also holds, so **every account number connected here must also be on the key** (see au-api's `docs/CUSTOMER_KEYS.md`). Account numbers are client numbers, so digits only. With no key, development falls back to a deterministic mock (`server/recordings/mock.ts`) and production refuses to serve recordings. Both sources sit behind `RecordingSource` in `server/utils/recordings.ts`. A transferred call is listed once per leg, each with its own audio.

**Messages.** The messages page (`/t/[slug]/messages`) shows the fields a platform admin picked from the tenant's *active message script*. The editor is at `/t/[slug]/settings/message-fields`, inside the tenant so the rail keeps its context (platform admins only; the old `/admin/tenants/[id]/message-fields` redirects there). It's linked from the All tenants menu and from section 05 of the tenant's Settings. The admin picks one of the tenant's account numbers. Its active script's field list comes from au-api's `/v1/scripts/active` (au-api parses the script and publishes only field names, labels, control types and list choices), or from a deterministic mock in development (`server/scripts/mock.ts`). Script labels carry operator markers (↟, ⇄, a standalone Ø, superscript digits) that `cleanFieldLabel()` strips wherever a label enters insight: from the script, when a saved label is read, and on save. The admin then chooses fields, orders them by dragging or with the arrow buttons, and gives each a label, a type (text, long text, number, currency, date, time, date and time, phone, email, yes/no, choice) and a format. A preview renders the result. A field's key is the script's own field name, compared case-insensitively. Saves replace the whole configuration in one transaction (`tenant_message_settings` and `tenant_message_fields`), guarded by a revision number so two admins can't overwrite each other. Every save is compared with the live script:
- fields no longer in it are kept but flagged *Not in script*, and hidden from the messages page unless *Show anyway* is on;
- fields new since the last save are marked *New*;
- a script hint that disagrees with the chosen type gets a notice, but the admin's choice stands.

One formatter, `formatFieldValue()` in `shared/utils/messageFields.ts`, renders values for both the page and the preview. A tenant can show at most 50 active fields, the most au-api returns per request. A field whose name au-api can't request (it must start with a letter or `_` and use only letters, digits, `_ . -`) is flagged *Can't be loaded* in the editor and stays empty.

Message data comes from au-api's `/v1/messages` (`server/messages/au-api.ts`, behind `MessageSource` in `server/utils/messages.ts`) with the same insight key as recordings. Each request names the tenant's account numbers and its visible fields, so au-api returns, and searches, only those fields. A single message (`?m=` deep links) is checked against the tenant's own account numbers in Insight, because the key covers every client. Values arrive as stored strings, and `formatFieldValue()` types them. au-api reads at most 7 days per request, and the first page of a busy week can take about 10 seconds; it then caches the week for a minute, so paging and searching are fast. The page therefore offers ranges of up to 7 days (default today, no *Any time*). A 7-day range across a daylight-saving change is an hour longer, so the server splits it into windows au-api accepts and pages across them. Messages share the tenant's recordings *history* setting. With no key, development uses generated rows (`server/messages/mock.ts`, marked *sample data* under the search) and production returns 503.

**Message filters.** An account can limit people to some of its messages. Owners and admins define named filters (a script field and a value, such as *GALLEY = GL7112*) in section 03 of the tenant's Settings, and assign them to people from the row menu on the Members page (`tenant_message_filters`, `membership_message_filters`). Someone without filters sees every message. Someone with filters sees only messages where at least one of them matches, and the messages page says so under the search. A filter matches when the field's value, trimmed, equals the filter's value, ignoring case (`messageMatches()` in `shared/utils/messageFilters.ts`). Platform admins are never filtered. The rules:
- Every message route (list, single message, export) passes `memberMessageMatch()` to the message source. au-api applies it as `match` on `/v1/messages`, before totals and paging. Its fields are read for matching only: never returned, searched or sortable, so a filter can use a field the page doesn't show. A single message is checked in Insight, and one outside the filters is the same 404 as a missing one.
- It fails closed. A message without the field doesn't match, so a filter whose field has left the script (flagged *Not in script*) matches nothing. If au-api doesn't confirm it applied `match` (`meta.match`, which versions before 1.18.0 lack), Insight returns 503 rather than unfiltered messages.
- Nothing silently widens what someone sees. A filter can't be deleted while it's anyone's only filter. Clearing someone's filters asks first. Nobody but a platform admin changes their own filters, and only owners change an owner's.
- A filter's field must be in the tenant's message setup, visible or not. A person's filters can use at most 10 fields and 100 values, au-api's `match` limits.

**Received.** When a message was taken is set up per tenant in the editor, on a *Received* row pinned above the selected fields (`tenant_message_settings.received_in_list` / `received_in_detail`, both on by default): *List* makes it a default table column and *Detail* makes it the message drawer's title. With both off it isn't shown anywhere: not in the table, the Columns menu, the drawer or the CSV export. A save needs at least one list column, Received or a field.

**Columns.** As on Recordings, anyone who can view messages picks their own table columns from a *Columns* menu: *Received* (unless the tenant hides it) and any field the page shows (list or detail; detail values are already sent with each row), in the configured field order. The choice is per person and per tenant, in `user_tenant_preferences.message_columns`: the chosen field keys plus a `__received_shown` or `__received_hidden` marker (names no loadable field can have). Null follows the fields' *list column* setting and the tenant's Received *List* setting, and *Reset to default* goes back to them. The last column shown can't be turned off, and if a stored choice would leave no columns the tenant's defaults are used. `PUT …/messages/columns` keeps only fields the page currently shows, and `resolveMessageColumns()` re-checks the choice against the current fields on every read, so a field an admin removes simply drops out. The export always has every visible field, and Received unless the tenant hides it.

**Sorting.** Every shown column sorts from its header (`sort`/`dir` in the URL, defaults left out), as on Recordings. Newest first is au-api's own order, so that pages in au-api as before. Any other order needs every match, so the list route loads the whole range and search (`loadAllMessages()`, 500 at a time, at most 10,000, the same as the export) and sorts it in Insight with `sortMessageRows()` before paging. Values sort by the field's type, read the way `formatFieldValue()` reads them: numbers and amounts by value, dates, date-and-times and times by when they are, yes/no and choices by the label shown, and anything else as natural text ("Unit 9" before "Unit 10"). Empty values go last either way, and ties stay newest first. The first click sorts dates and amounts high to low and everything else A–Z. A sort by a column that isn't shown, or no longer exists, falls back to newest first. The CSV export follows the list's sort.

**Export.** *Export CSV* on the messages page (`server/api/tenants/[tenantId]/messages/export.get.ts`, any role that can view messages) downloads every message matching the page's date range and search, across all pages and within the person's message filters: received time in the viewer's timezone, account number, then each field the page shows (list or detail) in order, formatted in full by `formatFieldValue()`. It uses the list's range rules (`resolveMessageRange()`) and visible fields, so hidden fields never leave. It pages through au-api 500 at a time (its maximum), refuses more than 10,000 messages, and is rate-limited to 30 exports an hour per user. Cells that a spreadsheet would run as a formula (starting with `= + - @`) get a leading `'` (`shared/utils/csv.ts`), and the response is `Cache-Control: no-store`.

Orphan state is decided at save time. If a script later drops a field, the messages page keeps showing it until an admin opens the editor, which flags it, and saves.

Tenant pages live under `/t/[slug]`, and tenant APIs under `/api/tenants/[tenantId]`. Every tenant API checks the caller's role with `requireTenantRole()` (`server/utils/auth.ts`). Roles are always read from the database, never from the session cookie.

**Sign-in methods.** Password, emailed one-time link or 6-digit code (valid 15 minutes, 5 attempts), and passkeys (WebAuthn, added from the Account page). Sessions are sealed cookies. Changing a password, resetting it, or choosing **Sign out other devices** bumps the user's `sessionVersion`, which invalidates every other session. People moving from the old Insight (`insight.answerunited.com`, email and password only) were imported without a password: the public `/welcome` page walks them through a first sign-in by emailed link, `/login?from=v1` (where the old site's redirect points) shows a banner pointing there, `/login.html` 301s to it, and a failed password sign-in says to use the emailed link. See `docs/DEPLOYMENT.md`, "Retiring insight.answerunited.com".

**Legal pages.** `/terms` and `/privacy` are public and use the `legal` layout. They're linked from the sign-in footer, the account menu and the Account page. When the app's data handling changes (new data stored, new providers, analytics), update `app/pages/privacy.vue` and its *Last updated* date.

**Rate limiting.** Auth endpoints are rate limited per IP and per email, using in-memory storage. When running more than one server instance, mount a shared storage driver (such as Redis) at `rate-limit` in the Nitro config.

## Design

Insight shares its "ink" theme with docu-script: ink neutrals, Bricolage Grotesque headings and Spline Sans Mono labels. The primary color, `cobalt`, is the Answer United logo blue (`#16348c`, lightened in dark mode for contrast). Light mode, the default, uses neutral gray and white surfaces; dark mode keeps the ink palette. Each user can switch from the account menu.

- **Tokens** live in `app/assets/css/main.css`: color ramps, fonts, radii, the type scale, app tokens such as `bg-sidebar` and `text-cobalt-text`, and utilities such as `kicker`, `mono-meta` and `hairline`. Prefer the semantic utilities (`bg-default`, `bg-muted`, `bg-elevated`, `text-highlighted`, `text-muted`, `border-default`) so both color modes keep working.
- **Component styles** (pill buttons, cards, modals, inputs) are overridden in `app/app.config.ts`. Fonts are self-hosted: variable woff2 files in `public/fonts/`, declared with `@font-face` at the top of `main.css` (`@nuxt/fonts` is off, so builds don't fetch them).
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

Insight runs at `https://insight.answerunited.net`: one EC2 instance behind an ALB, with nginx and PM2 on the box and MySQL on RDS. GitHub Actions builds each release offline and deploys it over SSM: push a `vX.Y.Z` tag matching `package.json`'s version. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) is the runbook, covering the AWS setup, the environment file, the first deploy, releasing, rolling back and day-to-day operations.

Migrations run on every deploy, before the new release starts, and are never reversed on rollback, so each one must keep the previous release working.

To try a production build locally:

```bash
pnpm build
pnpm preview
```

## Dependency Updates

Dependency updates are managed by [Renovate](https://docs.renovatebot.com) (configured in `renovate.json`).

---

© Answer United, Inc. All rights reserved.

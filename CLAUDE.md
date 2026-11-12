# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Insight is the Answer United customer portal (Nuxt 4, Nuxt UI, MySQL via Drizzle, nuxt-auth-utils). `README.md` has the full architecture write-up (tenancy, roles, tenant status, timezones, recordings, sign-in, design tokens); keep it in sync when behaviour it describes changes.

## Commands

```bash
pnpm dev                     # http://localhost:3000
pnpm lint                    # ESLint (also rejects unknown Tailwind classes)
pnpm typecheck               # vue-tsc via nuxt typecheck
pnpm test                    # Vitest unit tests (test/unit), no database
docker compose up -d         # local MySQL 8
pnpm db:generate             # migration from server/db/schema.ts changes (commit it with the schema)
pnpm db:migrate
pnpm admin:create <email> [name]
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck and the Vitest unit tests, so run all three before calling work done, and check UI changes in the browser. The tests are unit tests only: they don't run the app, so don't drop the browser check. `test/setup.ts` recreates the `shared/utils` auto-imports. Handler tests stub the Nitro auto-imports with `vi.stubGlobal` before importing the handler. A `shared/utils` file that tests or drizzle-kit load must import its own dependencies explicitly. With `NUXT_EMAIL_TRANSPORT=console`, sign in with "Email me a sign-in link" and take the link from the dev server output.

## Layout and conventions

- `shared/utils` is auto-imported on both client and server: constants, zod schemas (`schemas.ts`), roles, tenant status rules, recording columns. Put rules both sides need there rather than duplicating them.
- `server/utils` is auto-imported on the server; `useDb()` and `tables` come from `server/utils/db.ts`.
- API routes validate with zod through `readValidatedBody` / `getValidatedQuery(event, schema.parse)`. Errors are `createError({ statusCode, message })`, and the message is user-facing (the client shows it via `errorMessage()` in `app/utils/helpers.ts`).
- ESLint stylistic config: no trailing commas, 1tbs braces, no semicolons.

## Security model

- Tenant pages are `/t/[slug]`; tenant APIs are `/api/tenants/[tenantId]/...`. Every tenant API must start with `requireTenantRole(event, tenantId, minRole)` (`server/utils/auth.ts`), which reads the role from the database, treats platform admins as owners, applies `canOpenTenant()`, and returns 404 to non-members. `useTenant().can()` on the client only hides UI.
- `requireUser()` checks the session's `sessionVersion` against the user row; bumping it signs out every other session. `server/plugins/session.ts` revalidates on each session fetch.
- Admin-only APIs use `requirePlatformAdmin()`; admin pages use the `admin` middleware.
- Plans (`shared/utils/plans.ts`) gate features on the server with `requirePlanFeature()` after `requireTenantRole()` (platform admins get past it), and on the client with `PlanLocked` (shown locked, not hidden). User limits count members plus pending invitations (`tenantSeatsUsed()`).
- Changes to access or setup (platform admins, tenants, account numbers, message setup, account settings, roles, members, invitations, message filters) call `recordAudit()` (`server/utils/audit.ts`) after they succeed, with an action from `AUDIT_ACTIONS` and a wording in `describeAuditEvent()` (`shared/utils/audit.ts`). Platform admins must be at `NUXT_PLATFORM_ADMIN_DOMAINS`.

## Recordings

- Routes go through `requireRecordingAccess()` and `requireTenantRecording()` in `server/utils/recordings.ts`, which scope everything to the tenant's `tenant_recording_accounts`. `serializeRecording()` drops columns the tenant doesn't have available. Sorting, search and filters must also refuse hidden columns.
- Data comes from a `RecordingSource`: `server/recordings/au-api.ts` when `NUXT_AU_API_KEY` is set, else the deterministic mock in `server/recordings/mock.ts` in development (production returns 503). au-api lives in the sibling repo `../au-api`; changes to `/v1/recordings` there must stay additive and follow that repo's CLAUDE.md doc-sync rules.
- The au-api key and the presigned S3 audio URL never reach the browser or the logs. Audio is proxied by `audio.get.ts` with Range forwarded; the waveform is computed client-side (`app/utils/audioPeaks.ts`).

## Messages

- The page's fields come from the tenant's chosen account's **active script**. The config lives in `tenant_message_settings` and `tenant_message_fields`, the shared rules (types, formats, drift, `formatFieldValue()`, `MessageRow`) in `shared/utils/messageFields.ts`, and the saves in `server/utils/messageConfig.ts`.
- `fieldKey` is the script's own field name, matched case-insensitively (`canonicalFieldKey()`). Saves replace the whole config in one transaction, guarded by `revision`. Orphan state is decided on the server against the live script.
- Script fields come from au-api's `/v1/scripts/active` through `ScriptSource` (`server/utils/scripts.ts`), or the mock in development.
- Message data comes from au-api's `/v1/messages` through `MessageSource` (`server/utils/messages.ts`, `server/messages/au-api.ts`), or the mock in development. `serializeMessage()` drops anything outside the visible fields, and search must too (au-api searches only the fields requested, so request only visible ones).
- au-api limits: at most 50 fields per request (saves cap active fields at 50), names matching `RETRIEVABLE_FIELD_KEY`, and at most 7 days per request. Ranges come from the page as calendar days, so a week across DST is split into windows (`splitRange()`/`paginateWindows()`).
- Every message route starts with `requireMessageAccess(event, tenantId)` (`server/utils/messages.ts`): membership, the plan's `messages` feature, and the plan's `historyDays`. A test checks every file under `server/api/tenants/[tenantId]/messages/` for it.
- Message filters (`shared/utils/messageFilters.ts`, `server/utils/messageFilters.ts`): every message route must pass `memberMessageMatch(tenantId, user)` as the source's `match`, and a single message must be checked with `messageMatches()`. au-api applies `match` before totals and paging and confirms it with `meta.match`; the au-api source refuses (503) a filtered page without that confirmation. Match fields are never returned, searched or sorted. Nothing may widen a filtered member's view by accident (see the delete guard and `requireFilterableMember()`). Only viewers have filters (`assertFilterableRole()`), since admins and owners could edit their own.
- The insight key spans every client: a single message must be checked against the tenant's own account numbers (and its history window, which comes from the plan: `planHistoryDays()`) before it's returned.

## Deployment

- `docs/DEPLOYMENT.md` is the runbook: EC2 behind an ALB (TLS ends at the ALB), nginx on port 80, PM2, releases built offline in GitHub Actions and activated over SSM by `deploy/activate.sh`. Keep it in sync with `deploy/`, `scripts/build-*.sh`, `ecosystem.config.cjs` and the workflows.
- Branches: work happens on `develop`; `main` only receives releases. Commit to `develop` (or a short-lived branch merged into it), never directly to `main`.
- Release by bumping `package.json` `version` on `develop`, merging `develop` into `main` with a pull request titled "Release X.Y.Z", then pushing the matching `vX.Y.Z` tag on `main`. Versions already in S3 are never rebuilt.
- Migrations run before the switch and are never reversed on rollback, so they must be additive: the previous release has to keep working against the new schema.
- `/api/health` must stay free of database and au-api calls (it's the ALB health check and the deploy check).
- Builds run with no network: nothing may be fetched at build time (fonts are self-hosted in `public/fonts/`). A new dependency changes the build-cache key; the `build-cache` workflow refreshes it.
- Behind the ALB, nginx replaces `X-Forwarded-For` with the real client address (rate limits read the first entry) and passes `Host` and `X-Forwarded-Proto` through (passkeys depend on them).

## Design

Use the semantic Nuxt UI utilities (`bg-default`, `text-muted`, `border-default`, …) and the tokens in `app/assets/css/main.css` so light and dark mode both work. Component overrides live in `app/app.config.ts`. Reuse the primitives in `app/components` (`PageHeader`, `SectionKicker`, `AsideNote`, `IconTile`, …) before building new ones. Custom classes must be declared as `@utility` in `main.css`, or lint fails.

When data handling changes (new data stored, new providers, analytics), update `app/pages/privacy.vue` and its "Last updated" date.

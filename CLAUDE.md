# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Insight is the Answer United customer portal (Nuxt 4, Nuxt UI, MySQL via Drizzle, nuxt-auth-utils). `README.md` has the full architecture write-up (tenancy, roles, tenant status, timezones, recordings, sign-in, design tokens); keep it in sync when behaviour it describes changes.

## Commands

```bash
pnpm dev                     # http://localhost:3000
pnpm lint                    # ESLint (also rejects unknown Tailwind classes)
pnpm typecheck               # vue-tsc via nuxt typecheck
docker compose up -d         # local MySQL 8
pnpm db:generate             # migration from server/db/schema.ts changes (commit it with the schema)
pnpm db:migrate
pnpm admin:create <email> [name]
```

There is no test suite. CI (`.github/workflows/ci.yml`) runs only lint and typecheck, so run both before calling work done, and check UI changes in the browser. With `NUXT_EMAIL_TRANSPORT=console`, sign in with "Email me a sign-in link" and take the link from the dev server output.

## Layout and conventions

- `shared/utils` is auto-imported on both client and server: constants, zod schemas (`schemas.ts`), roles, tenant status rules, recording columns. Put rules both sides need there rather than duplicating them.
- `server/utils` is auto-imported on the server; `useDb()` and `tables` come from `server/utils/db.ts`.
- API routes validate with zod through `readValidatedBody` / `getValidatedQuery(event, schema.parse)`. Errors are `createError({ statusCode, message })`, and the message is user-facing (the client shows it via `errorMessage()` in `app/utils/helpers.ts`).
- ESLint stylistic config: no trailing commas, 1tbs braces, no semicolons.

## Security model

- Tenant pages are `/t/[slug]`; tenant APIs are `/api/tenants/[tenantId]/...`. Every tenant API must start with `requireTenantRole(event, tenantId, minRole)` (`server/utils/auth.ts`), which reads the role from the database, treats platform admins as owners, applies `canOpenTenant()`, and returns 404 to non-members. `useTenant().can()` on the client only hides UI.
- `requireUser()` checks the session's `sessionVersion` against the user row; bumping it signs out every other session. `server/plugins/session.ts` revalidates on each session fetch.
- Admin-only APIs use `requirePlatformAdmin()`; admin pages use the `admin` middleware.

## Recordings

- Routes go through `requireRecordingAccess()` and `requireTenantRecording()` in `server/utils/recordings.ts`, which scope everything to the tenant's `tenant_recording_accounts`. `serializeRecording()` drops columns the tenant doesn't have available. Sorting, search and filters must also refuse hidden columns.
- Data comes from a `RecordingSource`: `server/recordings/au-api.ts` when `NUXT_AU_API_KEY` is set, else the deterministic mock in `server/recordings/mock.ts` in development (production returns 503). au-api lives in the sibling repo `../au-api`; changes to `/v1/recordings` there must stay additive and follow that repo's CLAUDE.md doc-sync rules.
- The au-api key and the presigned S3 audio URL never reach the browser or the logs. Audio is proxied by `audio.get.ts` with Range forwarded; the waveform is computed client-side (`app/utils/audioPeaks.ts`).

## Design

Use the semantic Nuxt UI utilities (`bg-default`, `text-muted`, `border-default`, …) and the tokens in `app/assets/css/main.css` so light and dark mode both work. Component overrides live in `app/app.config.ts`. Reuse the primitives in `app/components` (`PageHeader`, `SectionKicker`, `AsideNote`, `IconTile`, …) before building new ones. Custom classes must be declared as `@utility` in `main.css`, or lint fails.

When data handling changes (new data stored, new providers, analytics), update `app/pages/privacy.vue` and its "Last updated" date.

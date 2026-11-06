# Task: /messages page and admin field configuration (part 1: field selection only)

## Goal

Build the `/t/{tenantId}/messages` page and the site-admin UI that decides which fields that page shows. Each tenant's fields are different. They come from the tenant account's **active script**, which you can get from **AU-API**. A site admin picks which script fields appear, puts them in order, and gives each one a type. The messages page then draws its layout from that saved configuration.

**Out of scope:** getting real message data. That will be its own session. Here, the messages page should render the configured layout with an empty state, plus a dev-only mock-data toggle so the layout can be checked. Build a clean seam where real data will plug in later.

## Phase 0: Discovery (do this first and report back before writing code)

Read the codebase and give me a short summary of:

1. **The /recordings page**: its route file, layout, components (header, filters, table/list, pagination, empty and loading states), how it gets data, and its styling conventions. `/messages` should match it closely and reuse the same components wherever possible.
2. **The AU-API client**: how we call it, how auth works, and the call(s) that return a tenant's **active script**. Show me an example of the script payload's shape and say exactly where the fields/variables live in it. Note whether the script already carries type hints (e.g. "number", "date") we can use as defaults.
3. **Auth/roles**: how "site admin" is told apart from tenant admins and tenant users, both in route middleware and in server/API handlers.
4. **Persistence**: the database/ORM, how migrations are done, and where tenant-level settings are kept now.
5. **Admin area**: where the existing site-admin pages live and how they are laid out.

Then propose your plan (data model, endpoints, routes, components) and **wait for my OK** before you implement.

## Requirements

### 1. Data model: tenant message field configuration

Save the configuration per tenant. Something like the following (change it to fit our conventions):

- `tenantId`
- `fieldKey`: a stable identifier for the field in the script. This is the join key that the data-retrieval session will use, so it has to be the script's own identifier, not the display label
- `label`: the display label; defaults to the script's label and the admin can override it
- `type`: one of `text`, `longText`, `number`, `currency`, `date`, `time`, `datetime`, `phone`, `email`, `boolean`, `select`
- `format`: optional, depends on type (e.g. decimal places, date format, 12h/24h, currency code, options for `select`)
- `order`: integer position
- `showInList`: shown as a column in the list/table
- `showInDetail`: shown in the message detail view (if /recordings has a detail view, follow its pattern)
- `isActive`
- `sourceScriptId` / `sourceScriptVersion`: which script the field came from
- `updatedBy` and `updatedAt`

Add a migration. Saves should be atomic: replace a tenant's whole configuration in one transaction so the order can never end up half-written.

### 2. Script drift

The active script can change after fields have been configured. Handle these cases:

- **A configured field is no longer in the active script:** keep the config, flag it as **orphaned** in the admin UI with a warning badge, and leave it out of the messages page by default. Don't delete it silently.
- **The script has new fields:** show them in the "available" list, marked as new.
- **The script's type hint differs from the saved type:** show a non-blocking notice. The admin's choice wins.

### 3. API endpoints (server-side)

- `GET` available fields for a tenant: calls AU-API for the active script. **Site admin only.**
- `GET` a tenant's message field config: readable by any authenticated member of that tenant (the messages page needs it) and by site admins.
- `PUT` a tenant's message field config: **site admin only, enforced on the server.** Validate it: each `fieldKey` unique, type in the allowed list, format valid for its type, no gaps or duplicates in order.
- Return clear errors when AI-API is unreachable or the tenant has no active script.

### 4. Admin UI: field selection

Put it in the existing site-admin area (follow its route conventions, e.g. `/admin/tenants/{tenantId}/message-fields`). Layout:

- **Left panel, available fields** from the active script: searchable, showing label, key and type hint, with "new" and "already added" states. Click or drag to add.
- **Right panel, selected fields:** drag-and-drop reordering (with keyboard-accessible move up/down too), an inline type dropdown, a format editor that changes with the type, a label override, `showInList` / `showInDetail` toggles, and remove.
- **Preview:** a live preview of the /messages table header and 2–3 rows of generated sample data, formatted by type, so the admin can see the result before saving.
- Save / Discard, a warning if there are unsaved changes, and a success or error toast.
- Show which script and version the fields came from, plus a "Refresh from script" action.

### 5. The /t/{tenantId}/messages page

- Same shell, header, filter bar placement, table, pagination and empty/loading states as /recordings.
- Columns are built from the tenant's config (`isActive && showInList`, in `order`).
- Build **one typed field-renderer/formatter module** (e.g. `formatFieldValue(value, type, format)`) that both the table and the admin preview use. It must handle null or missing values safely and should use the tenant's timezone for date/time if the app already stores one.
- If the tenant has no fields configured yet, show an empty state. Site admins also get a link to the config screen; other users see a neutral "not set up yet" message.
- Define a TypeScript type for a message row: a record keyed by `fieldKey`, plus standard metadata such as id and createdAt. Put a clearly marked stub data source behind it so the next session only has to replace the stub.

### 6. Quality

- Follow existing patterns in the codebase rather than introducing new libraries. If you need a drag-and-drop library, check what is already installed first and ask before adding one.
- Tests: the config validation, the formatter for every type (including null and bad input), the orphan/drift logic, and authorization (a non-site-admin gets 403 on PUT).
- Accessibility: labels on every control, keyboard-operable reordering.

## Deliverables

1. The Phase 0 summary and plan (stop for approval).
2. The migration and model.
3. The API endpoints with server-side authorization.
4. The admin field-selection UI.
5. The /messages page shell with dynamic, typed columns and the stub data seam.
6. Tests.
7. A short handoff note for the next session: where the stub lives, the row type contract, and how `fieldKey` maps to the script, so data retrieval can start straight away.

# Messages: handoff to the data-retrieval session

The field-selection work in `docs/messages-page.md` is done. The messages page renders
its configured layout, but it has no data yet. This note covers what the next session
needs to start retrieving messages.

## Where the stub is

- **`server/messages/stub.ts`**, marked `STUB (data-retrieval session)`. Replace it with
  the real source. It implements `MessageSource` from `server/utils/messages.ts`:

  ```ts
  interface MessageSource {
    readonly isMock: boolean
    list(query: MessageQuery): Promise<{ items: StoredMessage[], total: number }>
    get(id: string, query: Pick<MessageQuery, 'tenantId' | 'accountNumbers' | 'fields'>): Promise<StoredMessage | null>
  }
  ```

- `messageSource()` in `server/utils/messages.ts` chooses the source. Today it returns
  `stubMessages`, or `mockMessages` when `?mock=1` is set in development. To switch to
  the real source, point it there. You might use au-api when `NUXT_AU_API_KEY` is set,
  like recordings and scripts do. Keep the mock as the development fallback.
- These are the callers, and both are already done:
  - `server/api/tenants/[tenantId]/messages/index.get.ts`: list, with `page`,
    `pageSize`, `from`, `to` (exclusive) and `q`
  - `[messageId].get.ts`: one message, for `?m=` deep links

  Both run `requireTenantRole(…, 'viewer')`, load the tenant's visible fields and
  account numbers, and pass everything through `serializeMessage()`.

## The row contract

A source returns `StoredMessage`:

```ts
interface StoredMessage {
  id: string            // stable; used in ?m= links and GET /messages/:id
  createdAt: Date       // a real instant (UTC). au-api /v1 already converts Eastern wall-clock
  accountNumber: string | null
  values: Record<string, unknown>  // keyed by the SCRIPT's field names, any casing
}
```

`serializeMessage(message, fields)` turns that into the browser's `MessageRow`, which is
defined in `shared/utils/messageFields.ts`:

```ts
interface MessageRow {
  id: string
  createdAt: string     // ISO
  accountNumber: string | null
  fields: Record<fieldKey, string | number | boolean | null>
}
```

- `fields` contains **only** the tenant's visible fields: active, and either still in
  the script or marked "Show anyway". It's keyed by the configured `fieldKey` exactly.
  The stored key is matched case-insensitively, so `phone` in the store fills a field
  configured as `Phone`. Anything else in `values` never reaches the browser.
- Values may be raw strings as stored. `formatFieldValue()` handles typing and
  formatting on the client:
  - It accepts numbers as numbers or numeric strings.
  - It accepts dates as `YYYY-MM-DD` or `M/D/YYYY` (wall-clock, never shifted) or ISO
    instants with `Z` or an offset (shown in the viewer's timezone). Naive datetimes
    are shown as recorded.
  - It accepts checkbox values as `True`/`False` or the script's own `checkedValue`.
  - It accepts list values as stored values; it shows their labels.
  - Bad input is shown as given, and empty values become "—".
- **Search (`q`) must only match visible fields.** The query's `fields` lists them, and
  the mock in `server/messages/mock.ts` shows the pattern. Apply the same rule to any
  future sort or filter.

## How `fieldKey` maps to the script

- `fieldKey` is the field's `Name` in the Amtelco script. That's the identifier script
  expressions use, and the name call fields and on-screen controls store values under.
  The display label is a separate setting.
- au-api `GET /v1/scripts/active?clientNumber=N` publishes these names as
  `fields[].key`. It parses the stored script server-side and publishes only an
  allowlisted field list. The other published properties are:
  - `label`, `inputType`, `required`, `choices` and `checkbox`;
  - `sources`: `screen`, `callField` and/or `variable`;
  - `screens`.
- Script names are **case-insensitive**. Always compare with `canonicalFieldKey()`.
- Each tenant's fields come from **one** account number's script
  (`tenant_message_settings.script_account_number`). The tenant's messages may still
  come from **all** of its account numbers (`tenant_recording_accounts`, passed as
  `query.accountNumbers`). If two accounts run different scripts, a field missing from
  one account's messages is simply empty there.

## Still open for the data session

- **Where message values live.** au-api doesn't model stored messages yet. The new
  endpoint must be another additive `/v1` route under au-api's doc-sync rules, scoped
  by client number like `/v1/scripts/active`.
- **History window.** Recordings honour `tenants.recording_history_days`. Messages
  don't have a limit yet, so decide whether to reuse that setting or add one.
- **Orphan state refreshes only on save.** If a script drops a field, the messages page
  keeps showing that field until an admin opens the editor (which flags it) and saves.
  If that matters, refresh `orphaned` on a schedule or when the script version changes.
- **Navigation.** Messages is shown only to platform admins (`useAppNav()`, plus the
  dashboard card in `app/pages/t/[tenant]/index.vue`). Open it to everyone once real
  data is in.
- **Privacy page.** Field configuration is operational metadata, so
  `app/pages/privacy.vue` didn't change. Storing or proxying message content will need
  it updated.

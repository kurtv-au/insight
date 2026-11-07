import { z } from 'zod'

const bodySchema = z.object({
  // null goes back to the default: the fields' list setting, with Received
  columns: messageColumnsSchema.nullable(),
  received: z.boolean().default(true)
})

// Saves the person's own choice of message columns for this tenant. Only
// fields the messages page shows can be chosen; anything else is dropped.
// The person's Received choice is stored explicitly, so it outlasts a change
// to the account's default; hiding it is refused when it would leave no columns.
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireTenantRole(event, tenantId, 'viewer')
  const { columns, received } = await readValidatedBody(event, bodySchema.parse)

  let messageColumns: string[] | null = null
  if (columns) {
    const chosen = new Set(columns.map(canonicalFieldKey))
    const fields = await visibleMessageFields(tenantId)
    // In the fields' own spelling and order
    const keys = fields.filter(field => chosen.has(canonicalFieldKey(field.fieldKey))).map(field => field.fieldKey)
    // Hiding Received too would leave no columns, so that isn't saved
    messageColumns = [...keys, received || !keys.length ? MESSAGE_RECEIVED_SHOWN : MESSAGE_RECEIVED_HIDDEN]
  }

  await useDb().insert(tables.userTenantPreferences)
    .values({ userId: user.id, tenantId, messageColumns })
    .onDuplicateKeyUpdate({ set: { messageColumns, updatedAt: new Date() } })
  return { ok: true }
})

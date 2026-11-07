import { z } from 'zod'

const bodySchema = z.object({
  // null goes back to the fields' list setting
  columns: messageColumnsSchema.nullable()
})

// Saves the person's own choice of message columns for this tenant. Only
// fields the messages page shows can be chosen; anything else is dropped.
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireTenantRole(event, tenantId, 'viewer')
  const { columns } = await readValidatedBody(event, bodySchema.parse)

  let messageColumns: string[] | null = null
  if (columns) {
    const chosen = new Set(columns.map(canonicalFieldKey))
    const fields = await visibleMessageFields(tenantId)
    // In the fields' own spelling and order
    messageColumns = fields.filter(field => chosen.has(canonicalFieldKey(field.fieldKey))).map(field => field.fieldKey)
  }

  await useDb().insert(tables.userTenantPreferences)
    .values({ userId: user.id, tenantId, messageColumns })
    .onDuplicateKeyUpdate({ set: { messageColumns, updatedAt: new Date() } })
  return { ok: true }
})

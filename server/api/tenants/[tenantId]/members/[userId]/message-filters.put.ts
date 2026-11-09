// Replaces the message filters a member sees messages through. None means
// every message.
export default defineEventHandler(async (event) => {
  const { tenantId, targetUserId } = await requireFilterableMember(event)
  const { filterIds } = await readValidatedBody(event, memberMessageFiltersSchema.parse)

  await setMemberMessageFilters(tenantId, targetUserId, filterIds)
  return { ok: true }
})

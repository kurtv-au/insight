// Replaces the message filters a member sees messages through. None means
// every message.
export default defineEventHandler(async (event) => {
  const { tenantId, targetUserId, target, actor, tenant } = await requireFilterableMember(event)
  const { filterIds } = await readValidatedBody(event, memberMessageFiltersSchema.parse)
  assertFilterableRole(target.role, filterIds)

  const filters = await setMemberMessageFilters(tenantId, targetUserId, filterIds)
  await recordAudit(actor, {
    action: 'member.filters_changed',
    tenant,
    target: await memberEmail(targetUserId),
    details: { filters: filters.map(filter => filter.name).sort((a, b) => a.localeCompare(b)) }
  })
  return { ok: true }
})

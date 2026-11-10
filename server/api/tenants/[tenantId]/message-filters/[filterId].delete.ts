// Refused while it's someone's only filter: removing it would show them every message
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, tenant } = await requireTenantRole(event, tenantId, 'admin')
  const filter = await requireMessageFilter(tenantId, getRouterParam(event, 'filterId')!)

  await deleteMessageFilter(tenantId, filter.id)
  await recordAudit(user, {
    action: 'filter.deleted',
    tenant,
    target: filter.name,
    details: { filter: { name: filter.name, fieldKey: filter.fieldKey, value: filter.value } }
  })
  return { ok: true }
})

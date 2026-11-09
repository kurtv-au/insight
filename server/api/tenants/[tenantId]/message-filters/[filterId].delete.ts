// Refused while it's someone's only filter: removing it would show them every message
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  await requireTenantRole(event, tenantId, 'admin')
  const filter = await requireMessageFilter(tenantId, getRouterParam(event, 'filterId')!)

  await deleteMessageFilter(tenantId, filter.id)
  return { ok: true }
})

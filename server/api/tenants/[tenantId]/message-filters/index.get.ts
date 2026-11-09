// The account's message filters, and the fields a filter can use
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  await requireTenantRole(event, tenantId, 'admin')

  const [filters, fields] = await Promise.all([listMessageFilters(tenantId), messageFilterFields(tenantId)])
  return { filters, fields }
})

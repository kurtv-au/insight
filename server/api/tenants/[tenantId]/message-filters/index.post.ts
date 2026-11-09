export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireTenantRole(event, tenantId, 'admin')
  const input = await readValidatedBody(event, messageFilterSchema.parse)

  const filter = await validateMessageFilter(tenantId, input)
  const id = crypto.randomUUID()
  await useDb().insert(tables.tenantMessageFilters).values({ id, tenantId, ...filter, updatedByUserId: user.id })
  return { id }
})

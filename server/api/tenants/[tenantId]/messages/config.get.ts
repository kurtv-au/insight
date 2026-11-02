// The fields the tenant's messages page shows, in order
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireTenantRole(event, tenantId, 'viewer')
  const fields = await visibleMessageFields(tenantId)
  return {
    fields,
    configured: fields.length > 0,
    canConfigure: user.isPlatformAdmin,
    // The sample-data toggle exists only in development
    mockAvailable: import.meta.dev
  }
})

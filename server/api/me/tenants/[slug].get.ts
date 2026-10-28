import { eq } from 'drizzle-orm'

// Resolves a tenant slug to the tenant and the current user's role in it
export default defineEventHandler(async (event) => {
  const tenant = await useDb().query.tenants.findFirst({
    where: eq(tables.tenants.slug, getRouterParam(event, 'slug')!)
  })
  if (!tenant) {
    await requireUser(event)
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }

  const { role } = await requireTenantRole(event, tenant.id, 'viewer')
  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
    role
  }
})

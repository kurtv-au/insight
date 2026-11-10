import { eq } from 'drizzle-orm'

// Deletes a tenant for good. Memberships, invitations, recording account numbers
// and per-user preferences go with it (foreign keys cascade). Users stay, as they
// may belong to other tenants, and recordings stay in au-api. The audit log
// keeps the account's name.
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const db = useDb()

  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, getRouterParam(event, 'id')!) })
  const [result] = tenant
    ? await db.delete(tables.tenants).where(eq(tables.tenants.id, tenant.id))
    : [{ affectedRows: 0 }]
  if (!tenant || result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  await recordAudit(admin, { action: 'tenant.deleted', tenant, details: { slug: tenant.slug } })
  return { ok: true }
})

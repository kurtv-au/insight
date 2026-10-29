import { eq } from 'drizzle-orm'

// Deletes a tenant for good. Memberships, invitations, recording account numbers
// and per-user preferences go with it (foreign keys cascade). Users stay, as they
// may belong to other tenants, and recordings stay in au-api.
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)

  const [result] = await useDb().delete(tables.tenants)
    .where(eq(tables.tenants.id, getRouterParam(event, 'id')!))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  return { ok: true }
})

import { and, eq } from 'drizzle-orm'

// Changes what a filter matches, for everyone it's assigned to
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireTenantRole(event, tenantId, 'admin')
  const input = await readValidatedBody(event, messageFilterSchema.parse)
  const existing = await requireMessageFilter(tenantId, getRouterParam(event, 'filterId')!)

  const filter = await validateMessageFilter(tenantId, input, existing.id)
  await useDb().update(tables.tenantMessageFilters)
    .set({ ...filter, updatedByUserId: user.id })
    .where(and(eq(tables.tenantMessageFilters.id, existing.id), eq(tables.tenantMessageFilters.tenantId, tenantId)))
  return { ok: true }
})

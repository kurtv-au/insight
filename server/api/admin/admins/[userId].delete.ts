import { and, eq } from 'drizzle-orm'

// Takes away platform admin. The user and their account memberships stay.
// Nobody removes themselves, so there is always at least one admin.
export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const userId = getRouterParam(event, 'userId')!

  if (userId === admin.id) {
    throw createError({ statusCode: 400, message: 'Ask another platform admin to remove you' })
  }
  const target = await useDb().query.users.findFirst({
    where: and(eq(tables.users.id, userId), eq(tables.users.isPlatformAdmin, true))
  })
  if (!target) {
    throw createError({ statusCode: 404, message: 'Admin not found' })
  }

  await useDb().update(tables.users).set({ isPlatformAdmin: false }).where(eq(tables.users.id, userId))
  await recordAudit(admin, { action: 'admin.removed', target: target.email })
  return { ok: true }
})

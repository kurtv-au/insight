import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const [result] = await useDb().delete(tables.passkeys)
    .where(and(eq(tables.passkeys.id, getRouterParam(event, 'id')!), eq(tables.passkeys.userId, user.id)))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Passkey not found' })
  }
  return { ok: true }
})

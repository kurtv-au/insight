import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { name } = await readValidatedBody(event, bodySchema.parse)

  const [result] = await useDb().update(tables.passkeys)
    .set({ name })
    .where(and(eq(tables.passkeys.id, getRouterParam(event, 'id')!), eq(tables.passkeys.userId, user.id)))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Passkey not found' })
  }
  return { ok: true }
})

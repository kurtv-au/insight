import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { name } = await readValidatedBody(event, bodySchema.parse)

  await useDb().update(tables.users).set({ name }).where(eq(tables.users.id, user.id))
  await setUserSession(event, { user: { ...toSessionUser(user), name } })
  return { ok: true }
})

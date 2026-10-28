import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema.optional(),
  // null goes back to following the account's timezone
  timezone: timezoneSchema.nullable().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  if (body.name === undefined && body.timezone === undefined) {
    return { ok: true }
  }

  await useDb().update(tables.users).set(body).where(eq(tables.users.id, user.id))
  await setUserSession(event, { user: toSessionUser({ ...user, ...body }) })
  return { ok: true }
})

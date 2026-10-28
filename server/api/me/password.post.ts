import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  currentPassword: z.string().max(128).optional(),
  newPassword: passwordSchema
})

// Sets or changes the password, signing out every other session
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { currentPassword, newPassword } = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'password-change', user.email)

  if (user.passwordHash && !(currentPassword && await verifyPassword(user.passwordHash, currentPassword))) {
    throw createError({ statusCode: 400, message: 'Current password is incorrect' })
  }

  const db = useDb()
  await db.update(tables.users)
    .set({
      passwordHash: await hashPassword(newPassword),
      sessionVersion: sql`${tables.users.sessionVersion} + 1`
    })
    .where(eq(tables.users.id, user.id))

  // Re-issue this session with the new sessionVersion
  const updated = (await db.query.users.findFirst({ where: eq(tables.users.id, user.id) }))!
  await startSession(event, updated)
  return { ok: true }
})

import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema
})

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'password-reset')

  const userId = await consumeEmailLinkToken(token, 'password_reset')
  if (!userId) {
    throw createError({ statusCode: 400, message: 'This reset link is invalid or has expired.' })
  }

  const db = useDb()
  // Bumping sessionVersion signs the user out everywhere else
  await db.update(tables.users)
    .set({
      passwordHash: await hashPassword(password),
      sessionVersion: sql`${tables.users.sessionVersion} + 1`,
      // Following the emailed link proves ownership of the address
      emailVerifiedAt: sql`COALESCE(${tables.users.emailVerifiedAt}, ${new Date()})`
    })
    .where(eq(tables.users.id, userId))

  const user = await db.query.users.findFirst({ where: eq(tables.users.id, userId) })
  if (!user || user.disabledAt) {
    throw createError({ statusCode: 400, message: 'This reset link is invalid or has expired.' })
  }

  await startSession(event, user)
  return { ok: true }
})

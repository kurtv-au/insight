import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.union([
  z.object({ token: z.string().min(1).max(128) }),
  z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/) })
])

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'email-verify', 'email' in body ? body.email : undefined)

  let userId: string | null
  if ('token' in body) {
    userId = await consumeEmailLinkToken(body.token, 'login')
  } else {
    const user = await findUserByEmail(body.email)
    userId = user ? await consumeLoginCode(user.id, body.code) : null
  }

  const db = useDb()
  const user = userId ? await db.query.users.findFirst({ where: eq(tables.users.id, userId) }) : undefined
  if (!user || user.disabledAt) {
    throw createError({ statusCode: 400, message: 'This sign-in link or code is invalid or has expired.' })
  }

  if (!user.emailVerifiedAt) {
    await db.update(tables.users).set({ emailVerifiedAt: new Date() }).where(eq(tables.users.id, user.id))
  }

  await startSession(event, user)
  return { ok: true }
})

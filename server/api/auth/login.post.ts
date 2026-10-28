import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128)
})

// Verified against when the user doesn't exist, so response timing doesn't reveal valid emails
let dummyHash: Promise<string> | undefined

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'login', email)

  const user = await findUserByEmail(email)
  dummyHash ??= hashPassword('dummy-password-for-timing')
  const valid = await verifyPassword(user?.passwordHash ?? await dummyHash, password)

  if (!user?.passwordHash || !valid || user.disabledAt) {
    throw createError({ statusCode: 401, message: 'Invalid email or password' })
  }

  if (passwordNeedsReHash(user.passwordHash)) {
    await useDb().update(tables.users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(tables.users.id, user.id))
  }

  await startSession(event, user)
  return { ok: true }
})

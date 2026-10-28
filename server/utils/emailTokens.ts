import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'

type Purpose = 'login' | 'password_reset'

const TOKEN_TTL_MINUTES = 15
const MAX_CODE_ATTEMPTS = 5

/**
 * Creates a single-use email token (and optionally a 6-digit code) for the user,
 * invalidating any earlier unused tokens with the same purpose.
 */
export async function createEmailToken(userId: string, purpose: Purpose, withCode = false) {
  const db = useDb()
  const token = generateToken()
  const code = withCode ? generateCode() : undefined

  await db.update(tables.emailTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(tables.emailTokens.userId, userId),
      eq(tables.emailTokens.purpose, purpose),
      isNull(tables.emailTokens.usedAt)
    ))

  await db.insert(tables.emailTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(token),
    codeHash: code ? hashToken(code) : null,
    expiresAt: minutesFromNow(TOKEN_TTL_MINUTES)
  })

  return { token, code }
}

/** Marks the token used, returning false if another request consumed it first */
async function markUsed(id: string) {
  const [result] = await useDb().update(tables.emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(tables.emailTokens.id, id), isNull(tables.emailTokens.usedAt)))
  return result.affectedRows === 1
}

/** Consumes a token from an email link. Returns the user ID, or null if invalid. */
export async function consumeEmailLinkToken(token: string, purpose: Purpose) {
  const row = await useDb().query.emailTokens.findFirst({
    where: and(
      eq(tables.emailTokens.tokenHash, hashToken(token)),
      eq(tables.emailTokens.purpose, purpose),
      isNull(tables.emailTokens.usedAt),
      gt(tables.emailTokens.expiresAt, new Date())
    )
  })
  if (!row || !await markUsed(row.id)) {
    return null
  }
  return row.userId
}

/** Consumes the user's latest login code. Returns the user ID, or null if invalid. */
export async function consumeLoginCode(userId: string, code: string) {
  const db = useDb()
  const row = await db.query.emailTokens.findFirst({
    where: and(
      eq(tables.emailTokens.userId, userId),
      eq(tables.emailTokens.purpose, 'login'),
      isNull(tables.emailTokens.usedAt),
      gt(tables.emailTokens.expiresAt, new Date())
    ),
    orderBy: desc(tables.emailTokens.createdAt)
  })
  if (!row?.codeHash || row.attempts >= MAX_CODE_ATTEMPTS) {
    return null
  }

  if (!safeEqual(row.codeHash, hashToken(code))) {
    await db.update(tables.emailTokens)
      .set({ attempts: sql`${tables.emailTokens.attempts} + 1` })
      .where(eq(tables.emailTokens.id, row.id))
    return null
  }

  return await markUsed(row.id) ? row.userId : null
}

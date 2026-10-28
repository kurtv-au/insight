import { eq, lt } from 'drizzle-orm'
import type { H3Event } from 'h3'

const CHALLENGE_TTL_MINUTES = 5

export async function storeWebAuthnChallenge(_event: H3Event, challenge: string, attemptId: string) {
  const db = useDb()
  await db.delete(tables.webauthnChallenges).where(lt(tables.webauthnChallenges.expiresAt, new Date()))
  await db.insert(tables.webauthnChallenges).values({
    attemptId,
    challenge,
    expiresAt: minutesFromNow(CHALLENGE_TTL_MINUTES)
  })
}

/** Returns and deletes the stored challenge, so each challenge can be used only once */
export async function getWebAuthnChallenge(_event: H3Event, attemptId: string) {
  const db = useDb()
  const row = await db.query.webauthnChallenges.findFirst({ where: eq(tables.webauthnChallenges.attemptId, attemptId) })
  await db.delete(tables.webauthnChallenges).where(eq(tables.webauthnChallenges.attemptId, attemptId))

  if (!row || row.expiresAt < new Date()) {
    throw createError({ statusCode: 400, message: 'Passkey request expired. Please try again.' })
  }
  return row.challenge
}

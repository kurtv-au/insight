import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** Random URL-safe token for email links */
export function generateToken() {
  return randomBytes(32).toString('base64url')
}

/** Random 6-digit numeric code */
export function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** Tokens and codes are only ever stored as SHA-256 hashes */
export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000)
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

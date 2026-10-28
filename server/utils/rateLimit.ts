import type { H3Event } from 'h3'

interface Window {
  count: number
  resetAt: number
}

/**
 * Fixed-window rate limiter. Throws 429 once `limit` requests for `key` are made
 * within `windowSeconds`.
 *
 * Uses Nitro's in-memory storage, so limits are per server instance. Mount a shared
 * driver (e.g. Redis) at `rate-limit` when running more than one instance.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const storage = useStorage<Window>('rate-limit')
  const now = Date.now()
  const entry = await storage.getItem(key)

  if (!entry || entry.resetAt <= now) {
    await storage.setItem(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return
  }

  if (entry.count >= limit) {
    throw createError({
      statusCode: 429,
      message: 'Too many attempts. Please wait a few minutes and try again.'
    })
  }

  await storage.setItem(key, { count: entry.count + 1, resetAt: entry.resetAt })
}

/** Applies one limit per client IP and a tighter one per email address */
export async function rateLimitAuth(event: H3Event, action: string, email?: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  await rateLimit(`${action}:ip:${ip}`, 30, 15 * 60)
  if (email) {
    await rateLimit(`${action}:email:${normalizeEmail(email)}`, 10, 15 * 60)
  }
}

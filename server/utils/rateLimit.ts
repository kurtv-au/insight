import type { H3Event } from 'h3'

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()
let nextPrune = 0

/** Drops expired windows now and then, so the map doesn't grow without bound */
function prune(now: number) {
  if (now < nextPrune) {
    return
  }
  nextPrune = now + 60_000
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) {
      windows.delete(key)
    }
  }
}

/**
 * Fixed-window rate limiter. Throws 429 once `limit` requests for `key` are made
 * within `windowSeconds`.
 *
 * Counts in memory and synchronously (no await between reading and writing the
 * count), so requests sent in parallel can't all pass. Limits are per server
 * instance: with more than one, move this to a shared store (e.g. Redis) with
 * an atomic increment.
 */
export function rateLimit(key: string, limit: number, windowSeconds: number, now = Date.now()) {
  prune(now)
  const entry = windows.get(key)

  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return
  }

  if (entry.count >= limit) {
    throw createError({
      statusCode: 429,
      message: 'Too many attempts. Please wait a few minutes and try again.'
    })
  }

  entry.count++
}

/** Applies one limit per client IP and a tighter one per email address */
export function rateLimitAuth(event: H3Event, action: string, email?: string) {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  rateLimit(`${action}:ip:${ip}`, 30, 15 * 60)
  if (email) {
    rateLimit(`${action}:email:${normalizeEmail(email)}`, 10, 15 * 60)
  }
}

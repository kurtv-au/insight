import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/support: the Customer Service card shows the inbox the form
 * delivers to, and only to signed-in people.
 */

type Handler = (event: unknown) => Promise<{ email: string | null }>

let supportEmail = ''

beforeEach(() => {
  vi.resetModules()
  supportEmail = ''
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('requireUser', vi.fn(async () => ({ id: 'u1' })))
  vi.stubGlobal('useRuntimeConfig', () => ({ support: { email: supportEmail } }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function handler() {
  return (await import('../../server/api/support.get')).default as unknown as Handler
}

describe('GET /api/support', () => {
  it('returns NUXT_SUPPORT_EMAIL', async () => {
    supportEmail = 'help@example.com'
    expect(await (await handler())({})).toEqual({ email: 'help@example.com' })
  })

  it('returns null when it is not set', async () => {
    expect(await (await handler())({})).toEqual({ email: null })
  })

  it('requires a signed-in user', async () => {
    vi.stubGlobal('requireUser', vi.fn(async () => {
      throw new Error('Unauthorized')
    }))
    await expect((await handler())({})).rejects.toThrow('Unauthorized')
  })
})

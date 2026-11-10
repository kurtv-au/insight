import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as schema from '../../server/db/schema'

/**
 * The platform-admin APIs (/api/admin/admins), run in plain Node with the
 * Nitro auto-imports stubbed: only platform admins get in, checked before
 * anything is read or written; adding promotes or creates; nobody removes
 * themselves.
 */

type Handler = (event: unknown) => Promise<unknown>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

const me = { id: 'admin-1', name: 'Kurt', email: 'kurt@example.com', isPlatformAdmin: true }

let mocks: Record<string, ReturnType<typeof vi.fn>>
let body: Record<string, unknown>
let params: Record<string, string>
let existing: Record<string, unknown> | undefined
let target: Record<string, unknown> | undefined
let writes: { op: string, values: unknown }[]

beforeEach(() => {
  vi.resetModules()
  body = { email: 'New.Admin@Example.com', name: 'New Admin' }
  params = { userId: 'user-2' }
  existing = undefined
  target = { id: 'user-2', email: 'old.admin@example.com', isPlatformAdmin: true }
  writes = []
  mocks = {
    requirePlatformAdmin: vi.fn(async () => me),
    readValidatedBody: vi.fn(async (_event: unknown, parse: (b: unknown) => unknown) => parse(body)),
    findUserByEmail: vi.fn(async () => existing),
    sendEmail: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined),
    platformAdminDomains: vi.fn(() => ['example.com'])
  }
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => params[name])
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('emailSchema', z.email())
  vi.stubGlobal('normalizeEmail', (email: string) => email.trim().toLowerCase())
  vi.stubGlobal('appUrl', (path: string) => `https://insight.example${path}`)
  vi.stubGlobal('tables', schema)
  vi.stubGlobal('emailDomainAllowed', (email: string, domains: string[]) => domains.includes(email.split('@')[1]!.toLowerCase()))
  vi.stubGlobal('describeEmailDomains', (domains: string[]) => domains.map(domain => `@${domain}`).join(' or '))
  vi.stubGlobal('useDb', () => ({
    query: { users: { findFirst: async () => target } },
    insert: () => ({ values: async (values: unknown) => writes.push({ op: 'insert', values }) }),
    update: () => ({ set: (values: unknown) => ({ where: async () => writes.push({ op: 'update', values }) }) })
  }))
  for (const [name, fn] of Object.entries(mocks)) {
    vi.stubGlobal(name, fn)
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function load(path: string): Promise<Handler> {
  return (await import(path)).default
}

const POST = '../../server/api/admin/admins/index.post'
const DELETE = '../../server/api/admin/admins/[userId].delete'
const GET = '../../server/api/admin/admins/index.get'

describe('platform admin APIs: access', () => {
  for (const [name, path] of Object.entries({ GET, POST, DELETE })) {
    it(`${name} is for platform admins only, checked before anything else`, async () => {
      mocks.requirePlatformAdmin!.mockImplementation(() => Promise.reject(new HttpError(403, 'Forbidden')))
      await expect((await load(path))({})).rejects.toMatchObject({ statusCode: 403 })
      expect(mocks.readValidatedBody).not.toHaveBeenCalled()
      expect(writes).toEqual([])
      expect(mocks.sendEmail).not.toHaveBeenCalled()
    })
  }
})

describe('POST /api/admin/admins', () => {
  it('creates a new admin with no password and emails them how to sign in', async () => {
    const result = await (await load(POST))({}) as { id: string, created: boolean, emailed: boolean }
    expect(result).toMatchObject({ created: true, emailed: true })
    expect(writes).toEqual([{ op: 'insert', values: { id: result.id, email: 'new.admin@example.com', name: 'New Admin', isPlatformAdmin: true } }])
    const [to, message] = mocks.sendEmail!.mock.calls[0]!
    expect(to).toBe('new.admin@example.com')
    expect(message.subject).toBe('You\'re now an Insight admin')
    expect(message.text).toContain('Kurt made you an admin')
    expect(message.text).toContain('https://insight.example/login')
  })

  it('sends no email when asked not to', async () => {
    body.notify = false
    expect(await (await load(POST))({})).toMatchObject({ emailed: false })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('promotes an existing user, keeping the name they have', async () => {
    existing = { id: 'user-9', name: 'Their Name', isPlatformAdmin: false, disabledAt: null }
    expect(await (await load(POST))({})).toMatchObject({ id: 'user-9', created: false })
    expect(writes).toEqual([{ op: 'update', values: { isPlatformAdmin: true } }])
  })

  it('fills in a missing name when promoting', async () => {
    existing = { id: 'user-9', name: '', isPlatformAdmin: false, disabledAt: null }
    await (await load(POST))({})
    expect(writes).toEqual([{ op: 'update', values: { isPlatformAdmin: true, name: 'New Admin' } }])
  })

  it('refuses someone who is already an admin, or disabled', async () => {
    existing = { id: 'user-9', isPlatformAdmin: true }
    await expect((await load(POST))({})).rejects.toMatchObject({ statusCode: 409, message: 'new.admin@example.com is already a platform admin' })
    existing = { id: 'user-9', isPlatformAdmin: false, disabledAt: new Date() }
    await expect((await load(POST))({})).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/is disabled/) })
    expect(writes).toEqual([])
  })

  it('keeps the new admin when the email fails, and says so', async () => {
    mocks.sendEmail!.mockRejectedValue(new Error('SES down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await (await load(POST))({})).toMatchObject({ created: true, emailed: false })
    expect(writes).toHaveLength(1)
    spy.mockRestore()
  })
})

describe('POST /api/admin/admins: allowed domains', () => {
  it('refuses an address outside the allowed domains, before writing anything', async () => {
    body.email = 'someone@gmail.com'
    await expect((await load(POST))({})).rejects.toMatchObject({ statusCode: 400, message: 'Platform admins need an @example.com address' })
    expect(writes).toEqual([])
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('records who made them an admin', async () => {
    await (await load(POST))({})
    expect(mocks.recordAudit).toHaveBeenCalledWith(me, { action: 'admin.added', target: 'new.admin@example.com', details: { created: true } })
  })
})

describe('GET /api/admin/admins', () => {
  it('flags admins outside the allowed domains', async () => {
    const rows = [{ id: 'a', email: 'kurt@example.com' }, { id: 'b', email: 'legacy@gmail.com' }]
    const query = { from: () => query, where: () => query, orderBy: async () => rows }
    vi.stubGlobal('useDb', () => ({ select: () => query }))
    expect(await (await load(GET))({})).toEqual({
      domains: ['example.com'],
      admins: [{ ...rows[0], allowedDomain: true }, { ...rows[1], allowedDomain: false }]
    })
  })
})

describe('DELETE /api/admin/admins/:userId', () => {
  it('takes away platform admin and nothing else, and records it', async () => {
    await (await load(DELETE))({})
    expect(writes).toEqual([{ op: 'update', values: { isPlatformAdmin: false } }])
    expect(mocks.recordAudit).toHaveBeenCalledWith(me, { action: 'admin.removed', target: 'old.admin@example.com' })
  })

  it('refuses to remove yourself', async () => {
    params.userId = 'admin-1'
    await expect((await load(DELETE))({})).rejects.toMatchObject({ statusCode: 400 })
    expect(writes).toEqual([])
  })

  it('is a 404 for someone who isn’t an admin', async () => {
    target = undefined
    await expect((await load(DELETE))({})).rejects.toMatchObject({ statusCode: 404 })
    expect(writes).toEqual([])
  })
})

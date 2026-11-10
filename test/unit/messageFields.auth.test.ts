import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Authorization of the message-field admin APIs, run in plain Node: each
 * handler's Nitro auto-imports are stubbed as globals before it is imported.
 * The thing under test is the ORDER — the platform-admin check runs before the
 * body is read or anything is saved.
 */

type Handler = (event: unknown) => Promise<unknown>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

const forbidden = () => Promise.reject(new HttpError(403, 'Forbidden'))

const validBody = {
  revision: 0,
  scriptAccountNumber: '1042',
  fields: [{
    fieldKey: 'Phone', label: 'Phone', type: 'phone', format: { style: 'national' }, order: 0,
    showInList: true, showInDetail: true, isActive: true, showIfOrphaned: false
  }]
}

const script = { scriptId: 1, name: 'Main', versionNumber: 2, modifiedAt: null, complete: true, fields: [] }

let mocks: Record<string, ReturnType<typeof vi.fn>>

beforeEach(() => {
  vi.resetModules()
  mocks = {
    requirePlatformAdmin: vi.fn(async () => ({ id: 'admin-1', isPlatformAdmin: true })),
    readValidatedBody: vi.fn(async (_event: unknown, parse: (body: unknown) => unknown) => parse(validBody)),
    getValidatedQuery: vi.fn(async (_event: unknown, parse: (query: unknown) => unknown) => parse({})),
    adminMessageConfig: vi.fn(async () => ({ accountNumbers: ['1042'], settings: { scriptAccountNumber: '1042' }, fields: [] })),
    getActiveScript: vi.fn(async () => ({ status: 'ok', script })),
    saveMessageFieldConfig: vi.fn(async () => undefined),
    recordAudit: vi.fn(async () => undefined)
  }
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', () => 'tenant-1')
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
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

const PUT = '../../server/api/admin/tenants/[id]/message-fields/index.put'
const GET = '../../server/api/admin/tenants/[id]/message-fields/index.get'
const AVAILABLE = '../../server/api/admin/tenants/[id]/message-fields/available.get'

describe('PUT /api/admin/tenants/:id/message-fields', () => {
  it('returns 403 to a non-platform-admin and saves nothing', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(forbidden)
    const handler = await load(PUT)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.readValidatedBody).not.toHaveBeenCalled()
    expect(mocks.getActiveScript).not.toHaveBeenCalled()
    expect(mocks.saveMessageFieldConfig).not.toHaveBeenCalled()
  })

  it('returns 403 before validating, even for an invalid body', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(forbidden)
    mocks.readValidatedBody!.mockImplementation(async (_event, parse) => parse({ nonsense: true }))
    const handler = await load(PUT)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
  })

  it('saves a platform admin\'s valid config against the live script', async () => {
    const handler = await load(PUT)
    await handler({})
    expect(mocks.getActiveScript).toHaveBeenCalledWith('1042')
    expect(mocks.saveMessageFieldConfig).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', userId: 'admin-1', revision: 0, scriptAccountNumber: '1042', script
    }))
  })

  it('rejects an account number that is not the tenant\'s', async () => {
    mocks.adminMessageConfig!.mockResolvedValue({ accountNumbers: ['7'], settings: {}, fields: [] })
    const handler = await load(PUT)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.saveMessageFieldConfig).not.toHaveBeenCalled()
  })

  it('orphans everything when the account has no active script', async () => {
    mocks.getActiveScript!.mockResolvedValue({ status: 'no_script' })
    const handler = await load(PUT)
    await handler({})
    expect(mocks.saveMessageFieldConfig).toHaveBeenCalledWith(expect.objectContaining({ script: null }))
  })
})

describe('GET /api/admin/tenants/:id/message-fields', () => {
  it('returns 403 to a non-platform-admin', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(forbidden)
    const handler = await load(GET)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.adminMessageConfig).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/tenants/:id/message-fields/available', () => {
  it('returns 403 to a non-platform-admin without calling au-api', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(forbidden)
    const handler = await load(AVAILABLE)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.getActiveScript).not.toHaveBeenCalled()
  })

  it('maps an account au-api doesn\'t know to a 404 with a clear message', async () => {
    mocks.getActiveScript!.mockResolvedValue({ status: 'unknown_account' })
    const handler = await load(AVAILABLE)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404, message: expect.stringContaining('1042') })
  })

  it('returns a null script when the account has none', async () => {
    mocks.getActiveScript!.mockResolvedValue({ status: 'no_script' })
    const handler = await load(AVAILABLE)
    await expect(handler({})).resolves.toEqual({ accountNumber: '1042', script: null })
  })

  it('needs a connected account first', async () => {
    mocks.adminMessageConfig!.mockResolvedValue({ accountNumbers: [], settings: {}, fields: [] })
    const handler = await load(AVAILABLE)
    await expect(handler({})).rejects.toMatchObject({ statusCode: 409 })
  })
})

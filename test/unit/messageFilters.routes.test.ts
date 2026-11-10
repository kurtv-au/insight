import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import * as schema from '../../server/db/schema'

/**
 * Message filters on the server, run in plain Node with the Nitro auto-imports
 * stubbed: the message routes pass the person's match and a single message
 * outside it is a 404; the filter APIs check access before anything else; and
 * nothing silently widens what a filtered person sees.
 */

type Handler = (event: unknown) => Promise<unknown>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

const tenant = { id: 'tenant-1', slug: 'goodwill', timezone: 'America/Chicago', recordingHistoryDays: 365 }
const fields = [{ fieldKey: 'Name', label: 'Name', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true }]
const match = { GALLEY: ['GL7112'] }

let mocks: Record<string, ReturnType<typeof vi.fn>>
let params: Record<string, string>

beforeEach(() => {
  vi.resetModules()
  params = { tenantId: 'tenant-1', messageId: '42', filterId: 'f1', userId: 'user-2' }
  mocks = {
    requireTenantRole: vi.fn(async () => ({ user: { id: 'user-1', isPlatformAdmin: false }, tenant, role: 'admin' })),
    requireFilterableMember: vi.fn(async () => ({ tenantId: 'tenant-1', targetUserId: 'user-2', target: { role: 'viewer' }, actor: { id: 'user-1', email: 'admin@example.com' }, tenant })),
    readValidatedBody: vi.fn(async (_event: unknown, parse: (body: unknown) => unknown) => parse({ name: 'GL7112', fieldKey: 'GALLEY', value: 'GL7112', filterIds: [] })),
    getValidatedQuery: vi.fn(async (_event: unknown, parse: (query: unknown) => unknown) => parse({})),
    visibleMessageFields: vi.fn(async () => fields),
    memberMessageMatch: vi.fn(async () => match),
    messageHistoryStart: vi.fn(() => new Date('2026-01-01T00:00:00Z')),
    resolveMessageRange: vi.fn(() => ({ from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-08T00:00:00Z') })),
    get: vi.fn(async () => ({ id: '42', createdAt: new Date('2026-11-03T12:00:00Z'), accountNumber: '626', values: { Name: 'Caller', galley: ' gl7112 ' } })),
    list: vi.fn(async () => ({ items: [], total: 0 })),
    listMessageFilters: vi.fn(async () => []),
    messageFilterFields: vi.fn(async () => []),
    validateMessageFilter: vi.fn(async (_tenantId: string, input: unknown) => input),
    requireMessageFilter: vi.fn(async () => ({ id: 'f1' })),
    deleteMessageFilter: vi.fn(async () => undefined),
    setMemberMessageFilters: vi.fn(async () => []),
    recordAudit: vi.fn(async () => undefined),
    memberEmail: vi.fn(async () => 'viewer@example.com'),
    insert: vi.fn(() => ({ values: async () => undefined })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) }))
  }
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => params[name])
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('tables', schema)
  vi.stubGlobal('useDb', () => ({
    query: { tenantRecordingAccounts: { findMany: async () => [{ accountNumber: '626' }] } },
    insert: mocks.insert,
    update: mocks.update
  }))
  vi.stubGlobal('messageSource', () => ({ isMock: false, get: mocks.get, list: mocks.list }))
  vi.stubGlobal('serializeMessage', (message: { id: string }) => ({ id: message.id }))
  vi.stubGlobal('messageRangeQuerySchema', z.object({ q: z.string().optional(), sort: z.string().optional(), dir: z.string().optional() }))
  for (const [name, fn] of Object.entries(mocks)) {
    vi.stubGlobal(name, fn)
  }
  vi.stubGlobal('assertFilterableRole', (role: string, filterIds: string[]) => {
    if (filterIds.length && role !== 'viewer') {
      throw new HttpError(400, 'Message filters apply to viewers. Make them a viewer first.')
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function load(path: string): Promise<Handler> {
  return (await import(path)).default
}

describe('GET /api/tenants/:tenantId/messages/:messageId', () => {
  const DETAIL = '../../server/api/tenants/[tenantId]/messages/[messageId].get'

  it('loads the message with the person’s match and returns it when it matches', async () => {
    expect(await (await load(DETAIL))({})).toEqual({ id: '42' })
    expect(mocks.memberMessageMatch).toHaveBeenCalledWith('tenant-1', { id: 'user-1', isPlatformAdmin: false })
    expect(mocks.get).toHaveBeenCalledWith('42', expect.objectContaining({ match }))
  })

  it('is the same 404 as a missing message when it doesn’t match', async () => {
    mocks.get!.mockResolvedValue({ id: '42', createdAt: new Date('2026-11-03T12:00:00Z'), accountNumber: '626', values: { Name: 'Caller', GALLEY: 'GL535' } })
    await expect((await load(DETAIL))({})).rejects.toMatchObject({ statusCode: 404, message: 'Message not found' })
  })

  it('returns any message to someone without filters', async () => {
    mocks.memberMessageMatch!.mockResolvedValue(null)
    mocks.get!.mockResolvedValue({ id: '42', createdAt: new Date('2026-11-03T12:00:00Z'), accountNumber: '626', values: { Name: 'Caller' } })
    expect(await (await load(DETAIL))({})).toEqual({ id: '42' })
  })
})

describe('GET /api/tenants/:tenantId/messages', () => {
  it('pages with the person’s match', async () => {
    vi.stubGlobal('getValidatedQuery', async () => ({ page: 1, pageSize: 50 }))
    vi.stubGlobal('resolveMessageSort', () => ({ key: null, dir: 'desc' }))
    vi.stubGlobal('isDefaultMessageSort', () => true)
    await (await load('../../server/api/tenants/[tenantId]/messages/index.get'))({})
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ match, offset: 0, limit: 50 }))
  })
})

describe('message filter APIs', () => {
  const routes = {
    'GET filters': '../../server/api/tenants/[tenantId]/message-filters/index.get',
    'POST filter': '../../server/api/tenants/[tenantId]/message-filters/index.post',
    'PATCH filter': '../../server/api/tenants/[tenantId]/message-filters/[filterId].patch',
    'DELETE filter': '../../server/api/tenants/[tenantId]/message-filters/[filterId].delete'
  }

  for (const [name, path] of Object.entries(routes)) {
    it(`${name} needs admin, checked before reading or writing anything`, async () => {
      mocks.requireTenantRole!.mockImplementation(() => Promise.reject(new HttpError(403, 'Forbidden')))
      await expect((await load(path))({})).rejects.toMatchObject({ statusCode: 403 })
      expect(mocks.requireTenantRole).toHaveBeenCalledWith({}, 'tenant-1', 'admin')
      expect(mocks.readValidatedBody).not.toHaveBeenCalled()
      expect(mocks.deleteMessageFilter).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
    })
  }

  it('creates a validated filter for the tenant', async () => {
    const result = await (await load(routes['POST filter']))({}) as { id: string }
    expect(mocks.validateMessageFilter).toHaveBeenCalledWith('tenant-1', { name: 'GL7112', fieldKey: 'GALLEY', value: 'GL7112' })
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('PUT member filters checks who may change them before reading the body', async () => {
    const PUT = '../../server/api/tenants/[tenantId]/members/[userId]/message-filters.put'
    mocks.requireFilterableMember!.mockImplementation(() => Promise.reject(new HttpError(403, 'Forbidden')))
    await expect((await load(PUT))({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.readValidatedBody).not.toHaveBeenCalled()
    expect(mocks.setMemberMessageFilters).not.toHaveBeenCalled()

    mocks.requireFilterableMember!.mockResolvedValue({ tenantId: 'tenant-1', targetUserId: 'user-2', target: { role: 'viewer' }, actor: { id: 'user-1' }, tenant })
    await (await load(PUT))({})
    expect(mocks.setMemberMessageFilters).toHaveBeenCalledWith('tenant-1', 'user-2', [])
    expect(mocks.recordAudit).toHaveBeenCalledWith({ id: 'user-1' }, expect.objectContaining({
      action: 'member.filters_changed',
      target: 'viewer@example.com',
      details: { filters: [] }
    }))
  })

  it('PUT member filters refuses filters for an admin, but lets theirs be cleared', async () => {
    const PUT = '../../server/api/tenants/[tenantId]/members/[userId]/message-filters.put'
    mocks.requireFilterableMember!.mockResolvedValue({ tenantId: 'tenant-1', targetUserId: 'user-2', target: { role: 'admin' }, actor: { id: 'user-1' }, tenant })
    mocks.readValidatedBody!.mockImplementation(async (_event: unknown, parse: (body: unknown) => unknown) => parse({ filterIds: ['f1'] }))
    await expect((await load(PUT))({})).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.setMemberMessageFilters).not.toHaveBeenCalled()

    mocks.readValidatedBody!.mockImplementation(async (_event: unknown, parse: (body: unknown) => unknown) => parse({ filterIds: [] }))
    await (await load(PUT))({})
    expect(mocks.setMemberMessageFilters).toHaveBeenCalledWith('tenant-1', 'user-2', [])
  })

  it('records who changed a filter, before and after', async () => {
    mocks.requireMessageFilter!.mockResolvedValue({ id: 'f1', name: 'Old', fieldKey: 'GALLEY', value: 'GL1' })
    await (await load(routes['PATCH filter']))({})
    expect(mocks.recordAudit).toHaveBeenCalledWith({ id: 'user-1', isPlatformAdmin: false }, {
      action: 'filter.updated',
      tenant,
      target: 'GL7112',
      details: {
        before: { name: 'Old', fieldKey: 'GALLEY', value: 'GL1' },
        after: { name: 'GL7112', fieldKey: 'GALLEY', value: 'GL7112' }
      }
    })
  })
})

describe('requireFilterableMember', () => {
  let target: { role: string } | undefined

  beforeEach(() => {
    target = { role: 'viewer' }
    vi.stubGlobal('useDb', () => ({ query: { memberships: { findFirst: async () => target } } }))
  })

  async function check() {
    const { requireFilterableMember } = await import('../../server/utils/memberships')
    return requireFilterableMember({} as never)
  }

  it('lets an admin change a viewer’s filters', async () => {
    await expect(check()).resolves.toMatchObject({ tenantId: 'tenant-1', targetUserId: 'user-2' })
    expect(mocks.requireTenantRole).toHaveBeenCalledWith({}, 'tenant-1', 'admin')
  })

  it('refuses your own filters, unless you’re a platform admin', async () => {
    params.userId = 'user-1'
    await expect(check()).rejects.toMatchObject({ statusCode: 403 })
    mocks.requireTenantRole!.mockResolvedValue({ user: { id: 'user-1', isPlatformAdmin: true }, tenant, role: 'owner' })
    await expect(check()).resolves.toBeTruthy()
  })

  it('leaves owners to owners', async () => {
    target = { role: 'owner' }
    await expect(check()).rejects.toMatchObject({ statusCode: 403, message: 'Only owners can manage owners' })
    mocks.requireTenantRole!.mockResolvedValue({ user: { id: 'user-1', isPlatformAdmin: false }, tenant, role: 'owner' })
    await expect(check()).resolves.toBeTruthy()
  })

  it('is a 404 for someone who isn’t a member', async () => {
    target = undefined
    await expect(check()).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('deleteMessageFilter', () => {
  /** A transaction whose selects answer in order: the filter's holders, then their filter counts */
  function fakeDb(holders: { userId: string }[], totals: { userId: string, filters: number }[]) {
    const deleted: unknown[] = []
    const answers = [holders, totals]
    const chain = () => {
      const result = answers.shift()
      const query = {
        from: () => query,
        where: () => query,
        groupBy: () => Promise.resolve(result),
        for: () => Promise.resolve(result)
      }
      return query
    }
    const tx = { select: chain, delete: (table: unknown) => ({ where: async () => deleted.push(table) }) }
    vi.stubGlobal('useDb', () => ({ transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) }))
    return deleted
  }

  async function remove() {
    const { deleteMessageFilter } = await import('../../server/utils/messageFilters')
    return deleteMessageFilter('tenant-1', 'f1')
  }

  it('deletes a filter nobody has', async () => {
    const deleted = fakeDb([], [])
    await remove()
    expect(deleted).toEqual([schema.tenantMessageFilters])
  })

  it('deletes a filter everyone holding it has others besides', async () => {
    const deleted = fakeDb([{ userId: 'a' }], [{ userId: 'a', filters: 3 }])
    await remove()
    expect(deleted).toHaveLength(1)
  })

  it('refuses when it’s someone’s only filter, which would show them everything', async () => {
    const deleted = fakeDb([{ userId: 'a' }, { userId: 'b' }], [{ userId: 'a', filters: 1 }, { userId: 'b', filters: 2 }])
    await expect(remove()).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/only filter for 1 person/) })
    expect(deleted).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EXPORT_PAGE_SIZE, MAX_EXPORT_MESSAGES, exportDate, messagesToCsvRows } from '../../server/utils/messageExport'
import { toCsv } from '../../shared/utils/csv'
import type { MessageColumnField } from '../../shared/utils/messageFields'

/**
 * GET /api/tenants/:tenantId/messages/export, run in plain Node with its Nitro
 * auto-imports stubbed: access is checked first, every page up to the total
 * is fetched in au-api-sized pages, the cap is enforced before the rest is
 * fetched, and the download is marked as private customer data.
 */

type Handler = (event: unknown) => Promise<string>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

const fields: MessageColumnField[] = [
  { fieldKey: 'Name', label: 'Name', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true }
]
const tenant = { id: 'tenant-1', slug: 'goodwill', timezone: 'America/Chicago', recordingHistoryDays: 365 }
// Midnight to midnight in New York (the request's tz), across the Nov 1 DST change
const range = { from: new Date('2026-10-26T04:00:00Z'), to: new Date('2026-11-02T05:00:00Z') }

let mocks: Record<string, ReturnType<typeof vi.fn>>
let headers: Record<string, string>
let total: number

function stored(i: number) {
  return { id: `m${i}`, createdAt: new Date('2026-10-28T17:30:00Z'), accountNumber: '626', values: { name: `Caller ${i}` } }
}

beforeEach(() => {
  vi.resetModules()
  headers = {}
  total = 1234
  const list = vi.fn(async ({ offset, limit }: { offset: number, limit: number }) => ({
    items: Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => stored(offset + i)),
    total
  }))
  mocks = {
    requireTenantRole: vi.fn(async () => ({ user: { id: 'user-1' }, tenant, role: 'viewer' })),
    getValidatedQuery: vi.fn(async (_event: unknown, parse: (query: unknown) => unknown) => parse({ tz: 'America/New_York' })),
    rateLimit: vi.fn(async () => undefined),
    visibleMessageFields: vi.fn(async () => fields),
    resolveMessageRange: vi.fn(() => range),
    list
  }
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', () => 'tenant-1')
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('setResponseHeaders', (_event: unknown, values: Record<string, string>) => Object.assign(headers, values))
  vi.stubGlobal('messageRangeQuerySchema', z.object({ from: z.string().optional(), to: z.string().optional(), q: z.string().optional() }))
  vi.stubGlobal('useDb', () => ({ query: { tenantRecordingAccounts: { findMany: async () => [{ accountNumber: '626' }] } } }))
  vi.stubGlobal('tables', { tenantRecordingAccounts: { tenantId: 'tenant_id' } })
  vi.stubGlobal('messageSource', () => ({ isMock: false, list }))
  vi.stubGlobal('serializeMessage', (m: ReturnType<typeof stored>) => ({ id: m.id, createdAt: m.createdAt.toISOString(), accountNumber: m.accountNumber, fields: { Name: m.values.name } }))
  vi.stubGlobal('EXPORT_PAGE_SIZE', EXPORT_PAGE_SIZE)
  vi.stubGlobal('MAX_EXPORT_MESSAGES', MAX_EXPORT_MESSAGES)
  vi.stubGlobal('exportDate', exportDate)
  vi.stubGlobal('messagesToCsvRows', messagesToCsvRows)
  vi.stubGlobal('toCsv', toCsv)
  for (const [name, fn] of Object.entries(mocks)) {
    if (name !== 'list') {
      vi.stubGlobal(name, fn)
    }
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function load(): Promise<Handler> {
  return (await import('../../server/api/tenants/[tenantId]/messages/export.get')).default
}

describe('GET /api/tenants/:tenantId/messages/export', () => {
  it('checks access first, for viewers and up, and fetches nothing for a non-member', async () => {
    mocks.requireTenantRole!.mockImplementation(() => Promise.reject(new HttpError(404, 'Not found')))
    await expect((await load())({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.requireTenantRole).toHaveBeenCalledWith({}, 'tenant-1', 'viewer')
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('rate-limits per user', async () => {
    await (await load())({})
    expect(mocks.rateLimit).toHaveBeenCalledWith('messages-export:user-1', 30, 3600)
  })

  it('fetches every page up to the total, 500 at a time', async () => {
    const csv = await (await load())({})
    expect(mocks.list!.mock.calls.map(([q]) => [q.offset, q.limit])).toEqual([[0, 500], [500, 500], [1000, 500]])
    const lines = csv.trimEnd().split('\r\n')
    expect(lines).toHaveLength(1 + 1234)
    // Times in the viewer's zone (tz), not the tenant's
    expect(lines[0]).toBe('﻿Received (US/Eastern),Account #,Name')
    expect(lines[1]).toBe('2026-10-28 13:30,626,Caller 0')
  })

  it('refuses more than the cap after the first page', async () => {
    total = MAX_EXPORT_MESSAGES + 1
    await expect((await load())({})).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Choose a shorter range') })
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })

  it('downloads as a private attachment named for the account and days', async () => {
    await (await load())({})
    expect(headers).toEqual({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="goodwill-messages-2026-10-26-to-2026-11-01.csv"',
      'Cache-Control': 'no-store'
    })
  })

  it('writes just the header when no fields are configured, without loading messages', async () => {
    mocks.visibleMessageFields!.mockResolvedValue([])
    const csv = await (await load())({})
    expect(csv).toBe('﻿Received (US/Eastern),Account #\r\n')
    expect(mocks.list).not.toHaveBeenCalled()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { messageColumnsSchema, resolveMessageColumns } from '../../shared/utils/messageFields'
import type { MessageColumnField } from '../../shared/utils/messageFields'

/**
 * Each person's own message columns: which fields their messages table shows.
 * Resolved against the current fields every time, since a platform admin can
 * change the setup after someone chose.
 */

function field(fieldKey: string, order: number, showInList: boolean): MessageColumnField {
  return { fieldKey, label: fieldKey, type: 'text', format: {}, order, showInList, showInDetail: true }
}

// Out of order on purpose: columns follow `order`
const fields = [field('Reason', 2, false), field('CallTime', 0, true), field('EmployeeName', 1, true), field('Message', 3, false)]
const keys = (list: { fieldKey: string }[]) => list.map(f => f.fieldKey)

describe('resolveMessageColumns', () => {
  it('follows the fields\' list setting without a choice', () => {
    expect(keys(resolveMessageColumns(fields, null))).toEqual(['CallTime', 'EmployeeName'])
  })

  it('shows the chosen list and detail fields, in field order', () => {
    expect(keys(resolveMessageColumns(fields, ['Message', 'CallTime', 'Reason']))).toEqual(['CallTime', 'Reason', 'Message'])
  })

  it('matches keys case-insensitively', () => {
    expect(keys(resolveMessageColumns(fields, ['reason', 'CALLTIME']))).toEqual(['CallTime', 'Reason'])
  })

  it('ignores fields that no longer exist', () => {
    expect(keys(resolveMessageColumns(fields, ['Reason', 'Covid19Travel']))).toEqual(['Reason'])
  })

  it('falls back to the list setting when none of the chosen fields still exist', () => {
    expect(keys(resolveMessageColumns(fields, ['Covid19Travel', 'Covid19Contact']))).toEqual(['CallTime', 'EmployeeName'])
  })

  it('honours an empty choice: only Received shows', () => {
    expect(resolveMessageColumns(fields, [])).toEqual([])
  })
})

describe('messageColumnsSchema', () => {
  it('takes field keys', () => {
    expect(messageColumnsSchema.parse([' CallTime ', 'Reason'])).toEqual(['CallTime', 'Reason'])
  })

  it('rejects anything else', () => {
    expect(messageColumnsSchema.safeParse(['CallTime', 3]).success).toBe(false)
    expect(messageColumnsSchema.safeParse(['']).success).toBe(false)
    expect(messageColumnsSchema.safeParse(Array.from({ length: 201 }, (_, i) => `F${i}`)).success).toBe(false)
  })
})

/** PUT /api/tenants/:tenantId/messages/columns, with its Nitro auto-imports stubbed */
describe('PUT /api/tenants/:tenantId/messages/columns', () => {
  type Handler = (event: unknown) => Promise<unknown>
  class HttpError extends Error {
    constructor(public statusCode: number, message: string) {
      super(message)
    }
  }

  let mocks: Record<string, ReturnType<typeof vi.fn>>
  let saved: { values?: Record<string, unknown>, set?: Record<string, unknown> }
  let body: unknown

  beforeEach(() => {
    vi.resetModules()
    saved = {}
    body = { columns: ['message', 'CallTime', 'Hidden', 'Covid19Travel'] }
    mocks = {
      requireTenantRole: vi.fn(async () => ({ user: { id: 'user-1' }, tenant: { id: 'tenant-1' }, role: 'viewer' })),
      readValidatedBody: vi.fn(async (_event: unknown, parse: (b: unknown) => unknown) => parse(body)),
      visibleMessageFields: vi.fn(async () => [...fields].sort((a, b) => a.order - b.order))
    }
    vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
    vi.stubGlobal('getRouterParam', () => 'tenant-1')
    vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
    vi.stubGlobal('messageColumnsSchema', messageColumnsSchema)
    vi.stubGlobal('tables', { userTenantPreferences: {} })
    vi.stubGlobal('useDb', () => ({
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onDuplicateKeyUpdate: async ({ set }: { set: Record<string, unknown> }) => {
            saved = { values, set }
          }
        })
      })
    }))
    for (const [name, fn] of Object.entries(mocks)) {
      vi.stubGlobal(name, fn)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function load(): Promise<Handler> {
    return (await import('../../server/api/tenants/[tenantId]/messages/columns.put')).default
  }

  it('checks access first, for viewers and up, and saves nothing for a non-member', async () => {
    mocks.requireTenantRole!.mockImplementation(() => Promise.reject(new HttpError(404, 'Not found')))
    await expect((await load())({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.requireTenantRole).toHaveBeenCalledWith({}, 'tenant-1', 'viewer')
    expect(mocks.readValidatedBody).not.toHaveBeenCalled()
    expect(saved).toEqual({})
  })

  it('keeps only fields the page shows, in their own spelling and order', async () => {
    await expect((await load())({})).resolves.toEqual({ ok: true })
    expect(saved.values).toEqual({ userId: 'user-1', tenantId: 'tenant-1', messageColumns: ['CallTime', 'Message'] })
    expect(saved.set?.messageColumns).toEqual(['CallTime', 'Message'])
  })

  it('stores null to go back to the default, without loading fields', async () => {
    body = { columns: null }
    await (await load())({})
    expect(saved.values?.messageColumns).toBeNull()
    expect(mocks.visibleMessageFields).not.toHaveBeenCalled()
  })

  it('rejects a malformed body', async () => {
    body = { columns: 'CallTime' }
    await expect((await load())({})).rejects.toBeInstanceOf(z.ZodError)
  })
})

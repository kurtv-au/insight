import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'

/**
 * GET /api/admin/tenants/:id/recording-accounts: the account numbers a
 * tenant's messages and recordings come from, for its Settings' Account
 * numbers section. Platform admins only, on any plan.
 */

type Handler = (event: unknown) => Promise<unknown>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

let requirePlatformAdmin: ReturnType<typeof vi.fn>
let tenant: Record<string, unknown> | undefined
let findMany: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  tenant = { id: 'tenant-1', plan: 'basic' }
  requirePlatformAdmin = vi.fn(async () => ({ id: 'admin-1', isPlatformAdmin: true }))
  findMany = vi.fn(async () => [{ accountNumber: '626' }, { accountNumber: '9001' }])
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', () => 'tenant-1')
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('requirePlatformAdmin', requirePlatformAdmin)
  vi.stubGlobal('tables', schema)
  vi.stubGlobal('useDb', () => ({ query: { tenants: { findFirst: async () => tenant }, tenantRecordingAccounts: { findMany } } }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function list() {
  return ((await import('../../server/api/admin/tenants/[id]/recording-accounts/index.get')).default as unknown as Handler)({})
}

describe('GET /api/admin/tenants/:id/recording-accounts', () => {
  it('lists the account numbers, even on a plan without recordings', async () => {
    expect(await list()).toEqual({ accountNumbers: ['626', '9001'] })
  })

  it('is for platform admins only, checked before anything is read', async () => {
    requirePlatformAdmin.mockRejectedValue(new HttpError(403, 'Forbidden'))
    await expect(list()).rejects.toMatchObject({ statusCode: 403 })
    expect(findMany).not.toHaveBeenCalled()
  })

  it('404s an unknown account', async () => {
    tenant = undefined
    await expect(list()).rejects.toMatchObject({ statusCode: 404 })
  })
})

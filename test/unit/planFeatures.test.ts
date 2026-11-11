import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requirePlanFeature, seatLimitMessage } from '../../server/utils/plans'

/**
 * What each plan enables, per Answer United's pricing table: recordings and
 * exports from Basic+, user limits counting pending invitations, and the
 * plan's history window. Staff get past feature gates, not user limits.
 */

type Handler = (event: unknown) => Promise<unknown>

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the plan table', () => {
  it('includes each feature from the plan the pricing table says', () => {
    const included = (feature: PlanFeature) => PLANS.filter(plan => planIncludes(plan, feature))
    expect(included('messages')).toEqual(['basic', 'basic_plus', 'pro', 'enterprise'])
    expect(included('recordings')).toEqual(['basic_plus', 'pro', 'enterprise'])
    expect(included('export')).toEqual(['basic_plus', 'pro', 'enterprise'])
    expect(included('support')).toEqual(['basic_plus', 'pro', 'enterprise'])
    expect(included('configurableReporting')).toEqual(['pro', 'enterprise'])
    expect(included('multiLocation')).toEqual(['pro', 'enterprise'])
    expect(included('userManagement')).toEqual(['enterprise'])
    expect(included('customDevelopment')).toEqual(['enterprise'])
  })

  it('enforces only recordings and exports', () => {
    expect(PLAN_FEATURES.filter(feature => feature.enforced).map(feature => feature.key)).toEqual(['recordings', 'export'])
  })

  it('sets users and history per plan', () => {
    expect(PLANS.map(planMaxUsers)).toEqual([1, 5, 25, 250])
    expect(PLANS.map(plan => describeHistoryDays(planHistoryDays(plan)))).toEqual(['1 year', '3 years', '3 years', '6 years'])
  })

  it('says which plan adds a feature', () => {
    expect(upgradeHint('recordings')).toBe('Available on Basic+ and up')
    expect(upgradeHint('multiLocation')).toBe('Available on Pro and up')
    expect(upgradeHint('userManagement')).toBe('Available on Enterprise')
  })
})

describe('requirePlanFeature', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  })

  it('refuses a feature the plan lacks, naming the plan that adds it', () => {
    expect(() => requirePlanFeature({ tenant: { plan: 'basic' }, user: { isPlatformAdmin: false } }, 'recordings'))
      .toThrow('Call recordings aren’t included in this account’s Basic plan. Available on Basic+ and up.')
  })

  it('lets staff and included plans through', () => {
    expect(() => requirePlanFeature({ tenant: { plan: 'basic' }, user: { isPlatformAdmin: true } }, 'recordings')).not.toThrow()
    expect(() => requirePlanFeature({ tenant: { plan: 'basic_plus' }, user: { isPlatformAdmin: false } }, 'recordings')).not.toThrow()
  })
})

describe('requireRecordingAccess', () => {
  let access: { user: { id: string, isPlatformAdmin: boolean }, tenant: Record<string, unknown>, role: string }
  let findMany: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    access = {
      user: { id: 'user-1', isPlatformAdmin: false },
      tenant: { id: 'tenant-1', plan: 'basic', recordingColumns: null, recordingDefaultColumns: null, recordingHistoryDays: 365 },
      role: 'owner'
    }
    findMany = vi.fn(async () => [{ accountNumber: '626' }])
    vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
    vi.stubGlobal('requireTenantRole', vi.fn(async () => access))
    vi.stubGlobal('requirePlanFeature', requirePlanFeature)
    vi.stubGlobal('useDb', () => ({ query: { tenantRecordingAccounts: { findMany } } }))
    vi.stubGlobal('tables', { tenantRecordingAccounts: { tenantId: 'tenant_id', accountNumber: 'account_number' } })
    vi.stubGlobal('normalizeColumns', (columns: unknown) => columns)
  })

  async function requireRecordingAccess() {
    return (await import('../../server/utils/recordings')).requireRecordingAccess({} as never, 'tenant-1')
  }

  it('refuses a Basic account’s users before loading anything', async () => {
    await expect(requireRecordingAccess()).rejects.toMatchObject({ statusCode: 403 })
    expect(findMany).not.toHaveBeenCalled()
  })

  it('lets staff open a Basic account’s recordings, within Basic’s year', async () => {
    access.user.isPlatformAdmin = true
    const result = await requireRecordingAccess()
    expect(result.historyDays).toBe(365)
  })

  it('takes history from the plan, not the old setting', async () => {
    access.tenant.plan = 'enterprise'
    const result = await requireRecordingAccess()
    expect(result.historyDays).toBe(2190)
    expect(result.accountNumbers).toEqual(['626'])
  })
})

describe('POST /api/tenants/:tenantId/invitations: user limit', () => {
  let mocks: Record<string, ReturnType<typeof vi.fn>>
  let body: Record<string, unknown>
  let membership: unknown

  beforeEach(() => {
    vi.resetModules()
    body = { email: 'new@acme.com', role: 'viewer' }
    membership = undefined
    const user = { id: 'owner-1', email: 'owner@acme.com', isPlatformAdmin: false }
    mocks = {
      requireTenantRole: vi.fn(async () => ({ user, tenant: { id: 'tenant-1', name: 'Acme', plan: 'basic_plus' }, role: 'owner' })),
      readValidatedBody: vi.fn(async (_event: unknown, parse: (b: unknown) => unknown) => parse(body)),
      rateLimit: vi.fn(),
      findUserByEmail: vi.fn(async () => undefined),
      tenantSeatsUsed: vi.fn(async () => 4),
      createInvitation: vi.fn(async () => 'invite-1'),
      recordAudit: vi.fn(async () => undefined)
    }
    vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
    vi.stubGlobal('getRouterParam', () => 'tenant-1')
    vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
    vi.stubGlobal('normalizeEmail', (email: string) => email.trim().toLowerCase())
    vi.stubGlobal('seatLimitMessage', seatLimitMessage)
    vi.stubGlobal('tables', { memberships: { tenantId: 'tenant_id', userId: 'user_id' } })
    vi.stubGlobal('useDb', () => ({ query: { memberships: { findFirst: async () => membership } } }))
    for (const [name, fn] of Object.entries(mocks)) {
      vi.stubGlobal(name, fn)
    }
  })

  async function invite() {
    return ((await import('../../server/api/tenants/[tenantId]/invitations/index.post')).default as unknown as Handler)({})
  }

  it('invites while there’s room, counting members and pending invitations', async () => {
    await invite()
    expect(mocks.tenantSeatsUsed).toHaveBeenCalledWith('tenant-1', { exceptEmail: 'new@acme.com' })
    expect(mocks.createInvitation).toHaveBeenCalled()
  })

  it('refuses once the plan’s users are all used', async () => {
    mocks.tenantSeatsUsed!.mockResolvedValue(5)
    await expect(invite()).rejects.toMatchObject({
      statusCode: 409,
      message: 'This account’s Basic+ plan includes up to 5 users. Remove someone or contact us to add more.'
    })
    expect(mocks.createInvitation).not.toHaveBeenCalled()
  })

  it('still says an existing member is a member first', async () => {
    mocks.findUserByEmail!.mockResolvedValue({ id: 'user-2', email: 'new@acme.com' })
    membership = { role: 'viewer' }
    mocks.tenantSeatsUsed!.mockResolvedValue(5)
    await expect(invite()).rejects.toMatchObject({ statusCode: 409, message: 'new@acme.com is already a member' })
  })
})

describe('POST /api/invitations/:token/accept: user limit', () => {
  let members: number
  let inserted: unknown[]

  beforeEach(() => {
    vi.resetModules()
    members = 0
    inserted = []
    const invitation = { id: 'inv-1', tenantId: 'tenant-1', email: 'new@acme.com', role: 'viewer', tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active', plan: 'basic' } }
    const tx = {
      update: () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) }),
      select: () => ({ from: () => ({ where: async () => [{ n: members }] }) }),
      insert: () => ({
        values: (values: unknown) => {
          inserted.push(values)
          return { onDuplicateKeyUpdate: async () => undefined, then: (resolve: () => void) => resolve() }
        }
      })
    }
    vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
    vi.stubGlobal('getRouterParam', () => 'token')
    vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
    vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (b: unknown) => unknown) => parse({ name: 'New Person' }))
    vi.stubGlobal('rateLimitAuth', vi.fn())
    vi.stubGlobal('findPendingInvitation', async () => invitation)
    vi.stubGlobal('findUserByEmail', async () => undefined)
    vi.stubGlobal('hashPassword', async () => 'hash')
    vi.stubGlobal('recordAudit', vi.fn(async () => undefined))
    vi.stubGlobal('startSession', vi.fn(async () => undefined))
    vi.stubGlobal('tables', { invitations: { id: 'id', acceptedAt: 'accepted_at' }, memberships: { tenantId: 'tenant_id', userId: 'user_id' }, users: { id: 'id' } })
    vi.stubGlobal('useDb', () => ({
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      query: { users: { findFirst: async () => ({ id: 'user-new', email: 'new@acme.com' }) } }
    }))
  })

  async function accept() {
    return ((await import('../../server/api/invitations/[token]/accept.post')).default as unknown as Handler)({})
  }

  it('joins while the account has room', async () => {
    await expect(accept()).resolves.toMatchObject({ tenantSlug: 'acme' })
  })

  it('refuses when the account is already full (it moved to a smaller plan)', async () => {
    members = 1
    await expect(accept()).rejects.toMatchObject({
      statusCode: 409,
      message: 'Acme is full: its plan includes up to 1 user. Ask whoever invited you to make room.'
    })
    expect(inserted).toEqual([])
  })
})

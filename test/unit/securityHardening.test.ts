import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { safeRedirect } from '../../app/utils/helpers'

/**
 * The fixes from the November 2026 security review: redirects, rate limits,
 * sign-in code attempts, filtered members staying viewers, the platform-admin
 * domain rule and the audit log.
 */

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('tables', schema)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('safeRedirect', () => {
  it('keeps same-site paths', () => {
    expect(safeRedirect('/t/acme/messages?from=x')).toBe('/t/acme/messages?from=x')
  })

  it.each([
    ['https://evil.com', 'an absolute URL'],
    ['//evil.com', 'a protocol-relative URL'],
    ['/\\evil.com', 'a backslash browsers read as a slash'],
    ['/\t/evil.com', 'a tab browsers drop'],
    ['/\n/evil.com', 'a line break'],
    [['/a'], 'a repeated query parameter']
  ])('refuses %j (%s)', (value) => {
    expect(safeRedirect(value)).toBe('/')
  })
})

describe('rateLimit', () => {
  async function load() {
    vi.stubGlobal('normalizeEmail', (email: string) => email.toLowerCase())
    return import('../../server/utils/rateLimit')
  }

  it('allows the limit, then refuses until the window ends', async () => {
    const { rateLimit } = await load()
    for (let i = 0; i < 3; i++) {
      rateLimit('k', 3, 60, 1_000)
    }
    expect(() => rateLimit('k', 3, 60, 1_000)).toThrow(expect.objectContaining({ statusCode: 429 }))
    expect(() => rateLimit('k', 3, 60, 61_000)).not.toThrow()
  })

  it('counts synchronously, so parallel callers can’t all get through', async () => {
    const { rateLimit } = await load()
    const results = await Promise.allSettled(Array.from({ length: 20 }, async () => rateLimit('burst', 5, 60, 1_000)))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5)
  })
})

describe('consumeLoginCode', () => {
  let row: Record<string, unknown> | undefined
  let affected: number[]
  let updates: unknown[]

  beforeEach(() => {
    row = { id: 't1', userId: 'u1', codeHash: 'hash:123456', attempts: 0 }
    affected = [1, 1]
    updates = []
    vi.stubGlobal('hashToken', (value: string) => `hash:${value}`)
    vi.stubGlobal('safeEqual', (a: string, b: string) => a === b)
    vi.stubGlobal('useDb', () => ({
      query: { emailTokens: { findFirst: async () => row } },
      update: () => ({ set: (values: unknown) => ({ where: async () => {
        updates.push(values)
        return [{ affectedRows: affected.shift() ?? 0 }]
      } }) })
    }))
  })

  async function consume(code: string) {
    const { consumeLoginCode } = await import('../../server/utils/emailTokens')
    return consumeLoginCode('u1', code)
  }

  it('takes an attempt before checking the code, then signs in', async () => {
    expect(await consume('123456')).toBe('u1')
    expect(updates).toHaveLength(2)
  })

  it('refuses a wrong code after counting it', async () => {
    expect(await consume('000000')).toBeNull()
    expect(updates).toHaveLength(1)
  })

  it('refuses even the right code once the attempts are used up', async () => {
    affected = [0]
    expect(await consume('123456')).toBeNull()
    expect(updates).toHaveLength(1)
  })
})

describe('requireManageableMember: filtered members stay viewers', () => {
  let filters: number

  beforeEach(() => {
    filters = 2
    const params: Record<string, string> = { tenantId: 'tenant-1', userId: 'user-2' }
    vi.stubGlobal('getRouterParam', (_event: unknown, name: string) => params[name])
    vi.stubGlobal('hasRole', (role: string, min: string) => ({ owner: 3, admin: 2, viewer: 1 } as Record<string, number>)[role]! >= ({ owner: 3, admin: 2, viewer: 1 } as Record<string, number>)[min]!)
    vi.stubGlobal('requireTenantRole', async () => ({ user: { id: 'user-1' }, role: 'owner', tenant: { id: 'tenant-1', name: 'Acme' } }))
    const select = () => ({ from: () => ({ where: async () => [{ filters }] }) })
    vi.stubGlobal('useDb', () => ({ query: { memberships: { findFirst: async () => ({ role: 'viewer' }) } }, select }))
  })

  async function promote(newRole: string) {
    const { requireManageableMember } = await import('../../server/utils/memberships')
    return requireManageableMember({} as never, { newRole: newRole as never })
  }

  it('refuses to make a filtered viewer an admin or owner', async () => {
    await expect(promote('admin')).rejects.toMatchObject({ statusCode: 400 })
    await expect(promote('owner')).rejects.toMatchObject({ statusCode: 400 })
  })

  it('promotes a viewer without filters', async () => {
    filters = 0
    await expect(promote('admin')).resolves.toMatchObject({ targetUserId: 'user-2' })
  })
})

describe('assertFilterableRole', () => {
  it('gives filters only to viewers, but anyone’s can be cleared', async () => {
    const { assertFilterableRole } = await import('../../server/utils/memberships')
    expect(() => assertFilterableRole('viewer', ['f1'])).not.toThrow()
    expect(() => assertFilterableRole('admin', ['f1'])).toThrow(expect.objectContaining({ statusCode: 400 }))
    expect(() => assertFilterableRole('owner', [])).not.toThrow()
  })
})

describe('POST /api/tenants/:tenantId/invitations', () => {
  it('is limited per person, since each one sends an email', async () => {
    const rateLimit = vi.fn(() => {
      throw new HttpError(429, 'Too many attempts')
    })
    const createInvitation = vi.fn()
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('getRouterParam', () => 'tenant-1')
    vi.stubGlobal('requireTenantRole', async () => ({ user: { id: 'user-1' }, tenant: { id: 'tenant-1' }, role: 'admin' }))
    vi.stubGlobal('readValidatedBody', async () => ({ email: 'a@example.com', role: 'viewer' }))
    vi.stubGlobal('rateLimit', rateLimit)
    vi.stubGlobal('createInvitation', createInvitation)
    const handler = (await import('../../server/api/tenants/[tenantId]/invitations/index.post')).default as (e: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 429 })
    expect(rateLimit).toHaveBeenCalledWith('invite:user:user-1', 30, 3600)
    expect(createInvitation).not.toHaveBeenCalled()
  })
})

describe('platform admin domains', () => {
  it('parses the setting', () => {
    expect(parseEmailDomains(' AnswerUnited.com, @example.org ,, ')).toEqual(['answerunited.com', 'example.org'])
  })

  it('allows only exact domains, not subdomains or lookalikes', () => {
    const domains = ['answerunited.com']
    expect(emailDomainAllowed('Kurt@AnswerUnited.com', domains)).toBe(true)
    expect(emailDomainAllowed('kurt@mail.answerunited.com', domains)).toBe(false)
    expect(emailDomainAllowed('kurt@answerunited.com.evil.io', domains)).toBe(false)
    expect(emailDomainAllowed('kurt@notanswerunited.com', domains)).toBe(false)
    expect(emailDomainAllowed('answerunited.com', domains)).toBe(false)
  })
})

describe('recordAudit', () => {
  it('stores the event with copied names', async () => {
    const values = vi.fn(async () => undefined)
    vi.stubGlobal('useDb', () => ({ insert: () => ({ values }) }))
    const { recordAudit } = await import('../../server/utils/audit')
    await recordAudit({ id: 'u1', email: 'kurt@example.com' }, { action: 'member.removed', tenant: { id: 't1', name: 'Acme' }, target: 'x@example.com', details: { self: false } })
    expect(values).toHaveBeenCalledWith({
      actorUserId: 'u1',
      actorEmail: 'kurt@example.com',
      action: 'member.removed',
      tenantId: 't1',
      tenantName: 'Acme',
      targetLabel: 'x@example.com',
      details: { self: false }
    })
  })

  it('never fails the change it records', async () => {
    vi.stubGlobal('useDb', () => ({ insert: () => ({ values: async () => Promise.reject(new Error('db down')) }) }))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { recordAudit } = await import('../../server/utils/audit')
    await expect(recordAudit({ id: 'u1', email: 'e' }, { action: 'admin.added' })).resolves.toBeUndefined()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('lists only what changed', async () => {
    const { auditChanges } = await import('../../server/utils/audit')
    expect(auditChanges({ timezone: 'UTC', name: 'A', cols: ['x'] }, { timezone: 'UTC', name: 'B', cols: ['x'] }))
      .toEqual({ name: { from: 'A', to: 'B' } })
  })
})

describe('GET /api/admin/audit', () => {
  it('is for platform admins only', async () => {
    vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
    vi.stubGlobal('requirePlatformAdmin', async () => Promise.reject(new HttpError(403, 'Forbidden')))
    const getValidatedQuery = vi.fn()
    vi.stubGlobal('getValidatedQuery', getValidatedQuery)
    const handler = (await import('../../server/api/admin/audit/index.get')).default as (e: unknown) => Promise<unknown>
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    expect(getValidatedQuery).not.toHaveBeenCalled()
  })
})

describe('describeAuditEvent', () => {
  const samples: Record<AuditAction, { targetLabel?: string, details?: Record<string, unknown>, expected: string }> = {
    'admin.added': { targetLabel: 'a@x.com', details: { created: true }, expected: 'Made a@x.com a platform admin (new sign-in)' },
    'admin.removed': { targetLabel: 'a@x.com', expected: 'Removed a@x.com as a platform admin' },
    'tenant.created': { details: { invitedOwner: 'o@x.com' }, expected: 'Created the account and invited o@x.com as owner' },
    'tenant.updated': { details: { changes: { status: { from: 'setup', to: 'active' } } }, expected: 'Changed the account’s status from setup to active' },
    'tenant.deleted': { expected: 'Deleted the account' },
    'recording_account.added': { targetLabel: '1042', expected: 'Connected account number 1042' },
    'recording_account.removed': { targetLabel: '1042', expected: 'Disconnected account number 1042' },
    'message_fields.saved': { details: { fields: 5, scriptAccountNumber: '1042' }, expected: 'Saved the message setup: 5 fields from account 1042’s script' },
    'account.settings_changed': { details: { changes: { timezone: { from: 'UTC', to: 'US/Eastern' } } }, expected: 'Changed the timezone from UTC to US/Eastern' },
    'member.role_changed': { targetLabel: 'v@x.com', details: { from: 'viewer', to: 'admin' }, expected: 'Changed v@x.com’s role from Viewer to Admin' },
    'member.removed': { targetLabel: 'v@x.com', details: { self: true }, expected: 'v@x.com left the account' },
    'invitation.sent': { targetLabel: 'n@x.com', details: { role: 'viewer' }, expected: 'Invited n@x.com as viewer' },
    'invitation.revoked': { targetLabel: 'n@x.com', expected: 'Cancelled n@x.com’s invitation' },
    'invitation.accepted': { targetLabel: 'n@x.com', details: { role: 'admin' }, expected: 'n@x.com accepted an invitation as admin' },
    'filter.created': { details: { filter: { name: 'GL', fieldKey: 'GALLEY', value: 'GL1' } }, expected: 'Added message filter “GL” (GALLEY = GL1)' },
    'filter.updated': { details: { before: { name: 'A', fieldKey: 'F', value: '1' }, after: { name: 'B', fieldKey: 'F', value: '2' } }, expected: 'Changed message filter “A” (F = 1) to “B” (F = 2)' },
    'filter.deleted': { details: { filter: { name: 'GL', fieldKey: 'GALLEY', value: 'GL1' } }, expected: 'Deleted message filter “GL” (GALLEY = GL1)' },
    'member.filters_changed': { targetLabel: 'v@x.com', details: { filters: [] }, expected: 'Removed v@x.com’s message filters (they see every message)' }
  }

  it('has a sample for every action', () => {
    expect(Object.keys(samples).sort()).toEqual([...AUDIT_ACTIONS].sort())
  })

  for (const [action, sample] of Object.entries(samples)) {
    it(`describes ${action}`, () => {
      expect(describeAuditEvent({ action, targetLabel: sample.targetLabel ?? null, details: sample.details ?? null, tenantName: 'Acme' })).toBe(sample.expected)
    })
  }

  it('still reads for an action it doesn’t know', () => {
    expect(describeAuditEvent({ action: 'future.thing', targetLabel: 'x', details: null, tenantName: null })).toBe('future.thing: x')
  })
})

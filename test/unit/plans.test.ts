import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'

/**
 * Account plans: platform admins set them when creating an account or from its
 * Settings (PATCH /api/admin/tenants/[id]), only to a known plan, and the
 * change is audited in words ("plan from Basic+ to Pro").
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
let tenant: Record<string, unknown> | undefined
let writes: { op: string, values: Record<string, unknown> }[]

beforeEach(() => {
  vi.resetModules()
  body = {}
  tenant = { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active', plan: 'basic_plus' }
  writes = []
  mocks = {
    requirePlatformAdmin: vi.fn(async () => me),
    readValidatedBody: vi.fn(async (_event: unknown, parse: (b: unknown) => unknown) => parse(body)),
    recordAudit: vi.fn(async () => undefined),
    createInvitation: vi.fn(async () => undefined)
  }
  vi.stubGlobal('defineEventHandler', (handler: Handler) => handler)
  vi.stubGlobal('getRouterParam', () => 'tenant-1')
  vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => new HttpError(statusCode, message))
  vi.stubGlobal('tables', schema)
  vi.stubGlobal('normalizeEmail', (email: string) => email.trim().toLowerCase())
  vi.stubGlobal('normalizeColumns', (columns: unknown) => columns)
  vi.stubGlobal('auditChanges', (before: Record<string, unknown>, after: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(after)
      .filter(([key, value]) => before[key] !== value)
      .map(([key, value]) => [key, { from: before[key], to: value }])))
  vi.stubGlobal('useDb', () => ({
    query: { tenants: { findFirst: async () => tenant } },
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        writes.push({ op: 'insert', values })
        // The column default applies when no plan is given
        tenant = { ...values, plan: values.plan ?? 'basic_plus' }
      }
    }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => writes.push({ op: 'update', values }) }) })
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

const PATCH = '../../server/api/admin/tenants/[id].patch'
const POST = '../../server/api/admin/tenants/index.post'

describe('plans', () => {
  it('lists the four plans in tier order, Basic+ by default', () => {
    expect(PLANS).toEqual(['basic', 'basic_plus', 'pro', 'enterprise'])
    expect(PLANS.map(plan => PLAN_LABELS[plan])).toEqual(['Basic', 'Basic+', 'Pro', 'Enterprise'])
    expect(DEFAULT_PLAN).toBe('basic_plus')
    expect(schema.tenants.plan.default).toBe('basic_plus')
  })
})

describe('PATCH /api/admin/tenants/[id]: plan', () => {
  it('is for platform admins only, checked before anything else', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(() => Promise.reject(new HttpError(403, 'Forbidden')))
    body = { plan: 'pro' }
    await expect((await load(PATCH))({})).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.readValidatedBody).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('changes the plan and audits it', async () => {
    body = { plan: 'pro' }
    await (await load(PATCH))({})
    expect(writes).toEqual([{ op: 'update', values: { plan: 'pro' } }])
    expect(mocks.recordAudit).toHaveBeenCalledWith(me, {
      action: 'tenant.updated',
      tenant: { id: 'tenant-1', name: 'Acme' },
      details: { changes: { plan: { from: 'basic_plus', to: 'pro' } } }
    })
  })

  it('refuses a plan that doesn’t exist', async () => {
    body = { plan: 'platinum' }
    await expect((await load(PATCH))({})).rejects.toThrow()
    expect(writes).toEqual([])
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('no longer sets history, which comes from the plan', async () => {
    body = { recordingHistoryDays: 30 }
    await (await load(PATCH))({})
    expect(writes).toEqual([])
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })

  it('records nothing when the plan is unchanged', async () => {
    body = { plan: 'basic_plus' }
    await (await load(PATCH))({})
    expect(mocks.recordAudit).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/tenants: plan', () => {
  beforeEach(() => {
    tenant = undefined
    body = { name: 'Globex', slug: 'globex' }
  })

  it('is for platform admins only, checked before anything else', async () => {
    mocks.requirePlatformAdmin!.mockImplementation(() => Promise.reject(new HttpError(403, 'Forbidden')))
    await expect((await load(POST))({})).rejects.toMatchObject({ statusCode: 403 })
    expect(writes).toEqual([])
  })

  it('creates the account on the chosen plan and audits it', async () => {
    body.plan = 'enterprise'
    await (await load(POST))({})
    expect(writes[0]!.values).toMatchObject({ name: 'Globex', slug: 'globex', plan: 'enterprise' })
    expect(mocks.recordAudit).toHaveBeenCalledWith(me, expect.objectContaining({
      action: 'tenant.created',
      details: { slug: 'globex', plan: 'enterprise' }
    }))
  })

  it('leaves the plan to the column default when none is given', async () => {
    await (await load(POST))({})
    expect(writes[0]!.values.plan).toBeUndefined()
    expect(mocks.recordAudit).toHaveBeenCalledWith(me, expect.objectContaining({ details: { slug: 'globex', plan: 'basic_plus' } }))
  })

  it('refuses a plan that doesn’t exist', async () => {
    body.plan = 'platinum'
    await expect((await load(POST))({})).rejects.toThrow()
    expect(writes).toEqual([])
  })
})

describe('describeAuditEvent: plans', () => {
  it('words a plan change with the plan names', () => {
    expect(describeAuditEvent({
      action: 'tenant.updated',
      targetLabel: null,
      tenantName: 'Acme',
      details: { changes: { plan: { from: 'basic_plus', to: 'pro' } } }
    })).toBe('Changed the account’s plan from Basic+ to Pro')
  })

  it('names the plan an account was created on, if it has one', () => {
    expect(describeAuditEvent({ action: 'tenant.created', targetLabel: null, tenantName: 'Acme', details: { slug: 'acme', plan: 'pro' } }))
      .toBe('Created the account on Pro')
    expect(describeAuditEvent({ action: 'tenant.created', targetLabel: null, tenantName: 'Acme', details: { slug: 'acme', plan: 'pro', invitedOwner: 'o@acme.com' } }))
      .toBe('Created the account on Pro and invited o@acme.com as owner')
    expect(describeAuditEvent({ action: 'tenant.created', targetLabel: null, tenantName: 'Acme', details: { slug: 'acme' } }))
      .toBe('Created the account')
  })
})

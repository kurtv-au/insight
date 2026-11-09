import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The au-api message source (server/messages/au-api.ts), with `auApiGet`
 * stubbed: what it asks au-api for, how it pages across week-long windows, and
 * that a single message is only returned for the tenant's own numbers.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

type Query = Record<string, string | number | undefined>
type Call = { path: string, query: Query }

let calls: Call[]
let respond: (call: Call) => unknown

const auApiGet = vi.fn(async (path: string, query: Query) => {
  const call = { path, query }
  calls.push(call)
  return respond(call)
})
vi.stubGlobal('auApiGet', auApiGet)
vi.stubGlobal('createError', ({ statusCode, message }: { statusCode: number, message: string }) => Object.assign(new Error(message), { statusCode }))

const { auApiMessages, paginateWindows, requestedFieldNames, splitRange } = await import('../../server/messages/au-api')

function columns(...keys: string[]) {
  return keys.map((fieldKey, order) => ({
    fieldKey, label: fieldKey, type: 'text' as const, format: {}, order, showInList: true, showInDetail: true
  }))
}

function apiMessage(id: number, overrides: Record<string, unknown> = {}) {
  return {
    messageId: id,
    revision: 2,
    clientNumber: 1042,
    takenAt: '2026-11-03T19:35:45.310Z',
    fields: { Name: `Caller ${id}`, Phone: '5551234567' },
    ...overrides
  }
}

function listQuery(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 't1',
    accountNumbers: ['1042'],
    fields: columns('Name', 'Phone'),
    from: new Date('2026-11-01T04:00:00.000Z'),
    to: new Date('2026-11-04T05:00:00.000Z'),
    offset: 0,
    limit: 50,
    ...overrides
  }
}

beforeEach(() => {
  calls = []
  respond = () => ({ data: [], meta: { total: 0 } })
})

describe('splitRange', () => {
  const from = new Date('2026-10-27T04:00:00.000Z')

  it('keeps a range of up to 7 days as one window', () => {
    expect(splitRange(from, new Date(from.getTime() + 3 * DAY))).toHaveLength(1)
    expect(splitRange(from, new Date(from.getTime() + 7 * DAY))).toEqual([{ from, to: new Date(from.getTime() + 7 * DAY) }])
  })

  it('splits 7 days across a DST change into a week and an hour, newest first', () => {
    const to = new Date(from.getTime() + 7 * DAY + HOUR)
    expect(splitRange(from, to)).toEqual([
      { from: new Date(from.getTime() + HOUR), to },
      { from, to: new Date(from.getTime() + HOUR) }
    ])
  })

  it('returns no windows for an empty range', () => {
    expect(splitRange(from, from)).toEqual([])
  })
})

describe('paginateWindows', () => {
  it('takes a page from the first window when it fits', () => {
    expect(paginateWindows([120, 5], 50, 50)).toEqual([{ window: 0, offset: 50, limit: 50 }])
  })

  it('carries a page across the boundary', () => {
    expect(paginateWindows([120, 5], 100, 50)).toEqual([
      { window: 0, offset: 100, limit: 20 },
      { window: 1, offset: 0, limit: 5 }
    ])
  })

  it('skips windows the page starts after', () => {
    expect(paginateWindows([10, 30], 20, 5)).toEqual([{ window: 1, offset: 10, limit: 5 }])
  })

  it('returns nothing past the end', () => {
    expect(paginateWindows([10, 5], 15, 50)).toEqual([])
  })
})

describe('requestedFieldNames', () => {
  it('drops names au-api would refuse and repeats, and caps at 50', () => {
    expect(requestedFieldNames(columns('Name', 'Caller Name', 'name', '__x', 'Phone'))).toEqual(['Name', 'Phone'])
    expect(requestedFieldNames(columns(...Array.from({ length: 60 }, (_, i) => `F${i}`)))).toHaveLength(50)
  })
})

describe('auApiMessages.list', () => {
  it('asks for the tenant’s numbers and fields, and projects the rows', async () => {
    respond = () => ({ data: [apiMessage(7, { extra: 'ignored' })], meta: { total: 1 } })
    const result = await auApiMessages.list(listQuery({ accountNumbers: ['1042', 'ABC', '77'], q: 'smith', offset: 50, limit: 25 }))

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      path: '/v1/messages',
      query: {
        fields: 'Name,Phone',
        clientNumber: '1042,77',
        from: '2026-11-01T04:00:00.000Z',
        to: '2026-11-04T05:00:00.000Z',
        q: 'smith',
        offset: 50,
        limit: 25
      }
    })
    expect(result).toEqual({
      total: 1,
      items: [{
        id: '7',
        createdAt: new Date('2026-11-03T19:35:45.310Z'),
        accountNumber: '1042',
        values: { Name: 'Caller 7', Phone: '5551234567' }
      }]
    })
  })

  it('leaves out an empty search', async () => {
    await auApiMessages.list(listQuery({ q: '' }))
    expect(calls[0]!.query.q).toBeUndefined()
  })

  it('makes no request without a numeric account or a loadable field', async () => {
    expect(await auApiMessages.list(listQuery({ accountNumbers: ['ABC'] }))).toEqual({ items: [], total: 0 })
    expect(await auApiMessages.list(listQuery({ fields: columns('Caller Name') }))).toEqual({ items: [], total: 0 })
    expect(calls).toEqual([])
  })

  it('pages across two windows and adds up their totals', async () => {
    const from = new Date('2026-10-27T04:00:00.000Z')
    const to = new Date(from.getTime() + 7 * DAY + HOUR)
    const totals: Record<string, number> = { [to.toISOString()]: 3, [new Date(from.getTime() + HOUR).toISOString()]: 4 }
    respond = ({ query }) => {
      const total = totals[String(query.to)]!
      const start = Number(query.offset)
      const count = Math.max(0, Math.min(Number(query.limit), total - start))
      const base = query.to === to.toISOString() ? 100 : 200
      return { data: Array.from({ length: count }, (_, i) => apiMessage(base + start + i)), meta: { total } }
    }

    const result = await auApiMessages.list(listQuery({ from, to, offset: 2, limit: 3 }))
    expect(result.total).toBe(7)
    expect(result.items.map(message => message.id)).toEqual(['102', '200', '201'])
  })

  it('sends a member’s filters as match, and refuses a page au-api didn’t filter', async () => {
    const match = { GALLEY: ['GL7112', 'GL535'] }
    respond = () => ({ data: [apiMessage(1)], meta: { total: 1, match: true } })
    const result = await auApiMessages.list(listQuery({ match }))
    expect(calls[0]!.query.match).toBe('{"GALLEY":["GL7112","GL535"]}')
    // The filter field is matched in au-api, not requested as a column
    expect(calls[0]!.query.fields).toBe('Name,Phone')
    expect(result.total).toBe(1)

    // An au-api without `match` ignores it and would return every message
    respond = () => ({ data: [apiMessage(1)], meta: { total: 1 } })
    await expect(auApiMessages.list(listQuery({ match }))).rejects.toMatchObject({ statusCode: 503 })
  })

  it('sends no match for an unfiltered member', async () => {
    await auApiMessages.list(listQuery({ match: null }))
    expect(calls[0]!.query.match).toBeUndefined()
  })

  it('keeps a missing or bad takenAt as null', async () => {
    respond = () => ({ data: [apiMessage(1, { takenAt: null }), apiMessage(2, { takenAt: 'nope' })], meta: { total: 2 } })
    const { items } = await auApiMessages.list(listQuery())
    expect(items.map(message => message.createdAt)).toEqual([null, null])
  })
})

describe('auApiMessages.get', () => {
  const query = { tenantId: 't1', accountNumbers: ['1042'], fields: columns('Name') }

  it('returns a message for one of the tenant’s numbers', async () => {
    respond = () => ({ data: apiMessage(19291444) })
    const message = await auApiMessages.get('19291444', query)
    expect(calls[0]).toEqual({ path: '/v1/messages/19291444', query: { fields: 'Name' } })
    expect(message?.id).toBe('19291444')
  })

  it('also asks for the filter fields, so the route can check them', async () => {
    respond = () => ({ data: apiMessage(5) })
    await auApiMessages.get('5', { ...query, match: { GALLEY: ['GL7112'], name: ['x'] } })
    expect(calls[0]!.query).toEqual({ fields: 'GALLEY,name' })
  })

  it('refuses a message from a client number the tenant doesn’t have', async () => {
    respond = () => ({ data: apiMessage(5, { clientNumber: 9999 }) })
    expect(await auApiMessages.get('5', query)).toBeNull()
  })

  it('returns null for au-api’s 404', async () => {
    respond = () => null
    expect(await auApiMessages.get('5', query)).toBeNull()
  })

  it('never sends a malformed id', async () => {
    for (const id of ['abc', '0', '-1', '1.5', '../recordings/1', '2147483648', '12345678901']) {
      expect(await auApiMessages.get(id, query), id).toBeNull()
    }
    expect(calls).toEqual([])
  })
})

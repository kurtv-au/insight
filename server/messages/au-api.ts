import type { MessageQuery, MessageSource, StoredMessage } from '../utils/messages'

// Messages from au-api's customer API (/v1/messages), with this environment's
// insight key. The key covers every account number insight serves, so each list
// request names the tenant's own numbers, and a single message is checked
// against them here: au-api's own 404 only covers numbers off the key.
//
// Fields are requested by the tenant's configured fieldKeys (the script's names,
// which au-api matches case-insensitively and echoes back as sent). Search runs
// in au-api over exactly those fields, so it only matches what the tenant sees.

/** A message as /v1/messages publishes it */
interface ApiMessage {
  messageId: number
  revision: number | null
  clientNumber: number
  takenAt: string | null
  fields: Record<string, string | null>
}

interface ApiPage {
  data: ApiMessage[]
  meta: { total: number }
}

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const MAX_RANGE_MS = MAX_MESSAGE_RANGE_DAYS * DAY_MS
/** The first page of a busy week can take ~10s; au-api gives up at 55s */
const TIMEOUT_MS = 60_000
/** au-api's largest message id */
const MAX_MESSAGE_ID = 2147483647

export const MESSAGES_UNAVAILABLE = 'Messages aren’t available right now'

function auApi<T>(path: string, query: Record<string, string | number | undefined>) {
  return auApiGet<T>(path, query, { tag: 'messages', unavailableMessage: MESSAGES_UNAVAILABLE, timeout: TIMEOUT_MS })
}

/**
 * The names to request: configured keys au-api accepts, once each, at most
 * MAX_RETRIEVED_MESSAGE_FIELDS (saves enforce that limit; older configs may not).
 * A field left out simply shows as empty.
 */
export function requestedFieldNames(fields: readonly Pick<MessageColumnField, 'fieldKey'>[]) {
  const seen = new Set<string>()
  const names: string[] = []
  for (const { fieldKey } of fields) {
    const key = canonicalFieldKey(fieldKey)
    if (isRetrievableFieldKey(fieldKey) && !seen.has(key)) {
      seen.add(key)
      names.push(fieldKey)
    }
  }
  return names.slice(0, MAX_RETRIEVED_MESSAGE_FIELDS)
}

const warnedTenants = new Set<string>()
function fieldNamesFor(query: Pick<MessageQuery, 'tenantId' | 'fields'>) {
  const names = requestedFieldNames(query.fields)
  if (names.length < query.fields.length && !warnedTenants.has(query.tenantId)) {
    warnedTenants.add(query.tenantId)
    console.warn(`[messages] tenant ${query.tenantId}: ${query.fields.length - names.length} configured fields can't be requested from au-api`)
  }
  return names
}

/**
 * Splits [from, to) into windows au-api accepts, newest first. A range the page
 * offers is one window, except 7 calendar days across a DST change (7 days and
 * an hour), which becomes a week and an hour.
 */
export function splitRange(from: Date, to: Date): { from: Date, to: Date }[] {
  const windows: { from: Date, to: Date }[] = []
  let end = to.getTime()
  while (end > from.getTime()) {
    const start = Math.max(from.getTime(), end - MAX_RANGE_MS)
    windows.push({ from: new Date(start), to: new Date(end) })
    end = start
  }
  return windows
}

/**
 * Which slice of each window makes up rows [offset, offset + limit) of the
 * windows laid end to end, newest first. Windows the page doesn't reach are left out.
 */
export function paginateWindows(totals: readonly number[], offset: number, limit: number) {
  const slices: { window: number, offset: number, limit: number }[] = []
  let skip = offset
  let remaining = limit
  totals.forEach((total, window) => {
    if (remaining <= 0) {
      return
    }
    if (skip >= total) {
      skip -= total
      return
    }
    const take = Math.min(total - skip, remaining)
    slices.push({ window, offset: skip, limit: take })
    remaining -= take
    skip = 0
  })
  return slices
}

/** Explicit projection: `revision` and anything au-api adds later stay out */
function toStored(row: ApiMessage): StoredMessage {
  const takenAt = row.takenAt ? new Date(row.takenAt) : null
  return {
    id: String(row.messageId),
    createdAt: takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt : null,
    accountNumber: String(row.clientNumber),
    values: { ...row.fields }
  }
}

export const auApiMessages: MessageSource = {
  isMock: false,

  async list(query) {
    // Client numbers in the API are digits; anything else can't have messages
    const clientNumbers = query.accountNumbers.filter(n => /^\d+$/.test(n))
    const names = fieldNamesFor(query)
    if (!clientNumbers.length || !names.length) {
      return { items: [], total: 0 }
    }

    const to = query.to ?? new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS)
    const from = query.from ?? new Date(to.getTime() - MAX_RANGE_MS)
    const windows = splitRange(from, to)
    if (!windows.length) {
      return { items: [], total: 0 }
    }

    const page = (window: { from: Date, to: Date }, offset: number, limit: number) => auApi<ApiPage>('/v1/messages', {
      fields: names.join(','),
      clientNumber: clientNumbers.join(','),
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      q: query.q || undefined,
      offset,
      limit
    })

    // The newest window with the page asked for; the others just for their totals.
    // au-api caches each window for a minute, so the second round below is cheap.
    const first = await Promise.all(windows.map((window, index) =>
      index === 0 ? page(window, query.offset, query.limit) : page(window, 0, 1)))
    const totals = first.map(result => result?.meta.total ?? 0)
    const total = totals.reduce((sum, n) => sum + n, 0)
    if (windows.length === 1) {
      return { items: (first[0]?.data ?? []).map(toStored), total }
    }

    const slices = paginateWindows(totals, query.offset, query.limit)
    const rows = await Promise.all(slices.map(async (slice) => {
      if (slice.window === 0) {
        return first[0]?.data ?? []
      }
      const result = await page(windows[slice.window]!, slice.offset, slice.limit)
      return result?.data ?? []
    }))
    return { items: rows.flat().slice(0, query.limit).map(toStored), total }
  },

  async get(id, query) {
    if (!/^\d{1,10}$/.test(id) || Number(id) < 1 || Number(id) > MAX_MESSAGE_ID) {
      return null
    }
    const names = fieldNamesFor(query)
    if (!names.length) {
      return null
    }
    const result = await auApi<{ data: ApiMessage }>(`/v1/messages/${id}`, { fields: names.join(',') })
    // The key spans every client: only this tenant's numbers count
    if (!result || !query.accountNumbers.includes(String(result.data.clientNumber))) {
      return null
    }
    return toStored(result.data)
  }
}

import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { auApiRecordings } from '../recordings/au-api'
import { mockRecordings } from '../recordings/mock'

export interface Recording {
  id: string
  accountNumber: string
  startedAt: Date
  ani: string | null
  durationSeconds: number
  /** Where the live API's audio can be fetched for the next few minutes. Server-only. */
  audioUrl?: string | null
}

export interface RecordingQuery {
  accountNumbers: string[]
  from?: Date
  to?: Date
  /** Digits to find anywhere in the caller ID */
  callerDigits?: string
  accountNumber?: string
  minDuration?: number
  /** Ties, and calls with no caller ID, go newest first after the sorted column */
  sort: RecordingColumn
  direction: SortDirection
  offset: number
  limit: number
}

export interface RecordingSource {
  /** Matching recordings in the query's order, one page at a time */
  list(query: RecordingQuery): Promise<{ items: Recording[], total: number }>
  get(id: string): Promise<Recording | null>
  /** The recording's audio, honouring the browser's Range header so it can seek */
  audio(recording: Recording, range: string | undefined): Promise<Response>
}

// The recordings API when a key is configured. Without one, development uses
// generated mock data, and production fails rather than show made-up calls.
function source(): RecordingSource {
  if (useRuntimeConfig().auApi.key) {
    return auApiRecordings
  }
  if (import.meta.dev) {
    return mockRecordings
  }
  throw createError({ statusCode: 503, message: 'Recordings aren’t available right now' })
}

export async function listRecordings(query: RecordingQuery): Promise<{ items: Recording[], total: number }> {
  if (!query.accountNumbers.length) {
    return { items: [], total: 0 }
  }
  return source().list(query)
}

export async function getRecording(id: string): Promise<Recording | null> {
  return source().get(id)
}

export async function recordingAudio(recording: Recording, range: string | undefined): Promise<Response> {
  return source().audio(recording, range)
}

/**
 * Checks the user can see the tenant's recordings, and loads the tenant's
 * account numbers and column settings.
 */
export async function requireRecordingAccess(event: H3Event, tenantId: string) {
  const access = await requireTenantRole(event, tenantId, 'viewer')
  const accounts = await useDb().query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId),
    orderBy: tables.tenantRecordingAccounts.accountNumber
  })
  return {
    ...access,
    accountNumbers: accounts.map(account => account.accountNumber),
    available: normalizeColumns(access.tenant.recordingColumns ?? DEFAULT_AVAILABLE_COLUMNS),
    accountDefault: access.tenant.recordingDefaultColumns ? normalizeColumns(access.tenant.recordingDefaultColumns) : null
  }
}

/** Loads a recording that belongs to one of the tenant's account numbers, or 404s */
export async function requireTenantRecording(id: string, accountNumbers: string[]) {
  const recording = await getRecording(id)
  if (!recording || !accountNumbers.includes(recording.accountNumber)) {
    throw createError({ statusCode: 404, message: 'Recording not found' })
  }
  return recording
}

/** Leaves out fields whose column isn't available, so they never reach the browser */
export function serializeRecording(recording: Recording, available: readonly RecordingColumn[]): RecordingDto {
  return {
    id: recording.id,
    startedAt: recording.startedAt.toISOString(),
    ani: available.includes('ani') ? recording.ani : undefined,
    accountNumber: available.includes('accountNumber') ? recording.accountNumber : undefined,
    durationSeconds: available.includes('duration') ? recording.durationSeconds : undefined
  }
}

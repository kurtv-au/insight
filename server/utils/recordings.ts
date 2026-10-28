import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { getMockRecording, listMockRecordings, mockRecordingAudio } from '../recordings/mock'

export interface Recording {
  id: string
  accountNumber: string
  startedAt: Date
  ani: string | null
  agent: string
  durationSeconds: number
}

export interface RecordingQuery {
  accountNumbers: string[]
  from?: Date
  to?: Date
  search?: string
  /** Whether the search may match caller IDs / agent initials (only if those columns are available) */
  searchAni?: boolean
  searchAgent?: boolean
  accountNumber?: string
  minDuration?: number
  /** Ties, and calls with no caller ID, go newest first after the sorted column */
  sort: RecordingColumn
  direction: SortDirection
  offset: number
  limit: number
}

// The recording source. These use generated mock data until the live recordings
// API is connected; swap the implementations here and nothing else changes.

/** Matching recordings in the query's order, one page at a time */
export async function listRecordings(query: RecordingQuery): Promise<{ items: Recording[], total: number }> {
  if (!query.accountNumbers.length) {
    return { items: [], total: 0 }
  }
  return listMockRecordings(query)
}

export async function getRecording(id: string): Promise<Recording | null> {
  return getMockRecording(id)
}

/** The recording's audio as a WAV file */
export async function recordingAudio(recording: Recording): Promise<Buffer> {
  return mockRecordingAudio(recording)
}

/** Bars in the player's waveform */
const WAVEFORM_BARS = 72

/** The recording's loudness over time, 0–1, for the player's waveform */
export async function recordingWaveform(recording: Recording): Promise<number[]> {
  // If the live API supplies its own waveform data, return that here instead
  return wavPeaks(await recordingAudio(recording), WAVEFORM_BARS)
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
    agent: available.includes('agent') ? recording.agent : undefined,
    accountNumber: available.includes('accountNumber') ? recording.accountNumber : undefined,
    durationSeconds: available.includes('duration') ? recording.durationSeconds : undefined
  }
}

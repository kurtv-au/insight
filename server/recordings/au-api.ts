import type { Recording, RecordingSource } from '../utils/recordings'

// Recordings from au-api's customer API (/v1/recordings), with this environment's
// insight key. The key covers every account number insight serves; each request
// names the tenant's own numbers, and au-api only returns those the key also holds.

/** A call segment as /v1/recordings publishes it. Transferred calls have one per leg. */
interface ApiRecording {
  recId: number
  callTime: string | null
  endTime: string | null
  /** Milliseconds */
  callDuration: number | null
  clientNumber: number
  callerNumber: string | null
}

interface ApiRecordingDetail extends ApiRecording {
  /** A presigned S3 link, good for a few minutes. A credential: never log it or send it to the browser. */
  audio: { url: string, contentType: string } | null
}

const SORT_FIELDS: Record<RecordingColumn, string> = {
  timestamp: 'callTime',
  ani: 'callerNumber',
  accountNumber: 'clientNumber',
  duration: 'callDuration'
}

/** The API defaults to the last 30 days, so "any time" needs an explicit start */
const EARLIEST = '2000-01-01T00:00:00.000Z'

async function auApi<T>(path: string, query?: Record<string, string | number | undefined>) {
  const { url, key } = useRuntimeConfig().auApi
  try {
    return await $fetch<T>(path, { baseURL: url, query, headers: { Authorization: `Bearer ${key}` } })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404) {
      return null
    }
    // Only the status: the error's request details include the key header
    console.error(`[recordings] au-api ${path} failed:`, status ?? (err as Error).message)
    throw createError({ statusCode: 503, message: 'Recordings aren’t available right now' })
  }
}

function toRecording(row: ApiRecording): Recording {
  return {
    id: String(row.recId),
    accountNumber: String(row.clientNumber),
    startedAt: new Date(row.callTime ?? row.endTime ?? 0),
    ani: row.callerNumber,
    durationSeconds: Math.round((row.callDuration ?? 0) / 1000)
  }
}

export const auApiRecordings: RecordingSource = {
  async list(query) {
    // Client numbers in the API are digits; anything else can't have recordings
    const clientNumbers = (query.accountNumber ? [query.accountNumber] : query.accountNumbers).filter(n => /^\d+$/.test(n))
    if (!clientNumbers.length) {
      return { items: [], total: 0 }
    }

    // Always name the sort: the API's default order is by recording ID, which follows
    // when a recording was saved, not when the call started
    const page = await auApi<{ data: ApiRecording[], meta: { total: number } }>('/v1/recordings', {
      clientNumber: clientNumbers.join(','),
      from: query.from?.toISOString() ?? EARLIEST,
      to: query.to?.toISOString(),
      callerContains: query.callerDigits,
      minDuration: query.minDuration || undefined,
      sort: SORT_FIELDS[query.sort],
      dir: query.direction,
      count: 'true',
      offset: query.offset,
      limit: query.limit
    })
    return { items: page?.data.map(toRecording) ?? [], total: page?.meta.total ?? 0 }
  },

  async get(id) {
    if (!/^\d{1,18}$/.test(id)) {
      return null
    }
    const detail = await auApi<{ data: ApiRecordingDetail }>(`/v1/recordings/${id}`)
    return detail && { ...toRecording(detail.data), audioUrl: detail.data.audio?.url ?? null }
  },

  async audio(recording, range) {
    if (!recording.audioUrl) {
      throw createError({ statusCode: 404, message: 'This call has no audio' })
    }
    // No Authorization header: the link carries its own, and S3 rejects two
    const response = await fetch(recording.audioUrl, { headers: range ? { Range: range } : {} })
    if (!response.ok && response.status !== 416) {
      console.error(`[recordings] audio for ${recording.id} failed with ${response.status}`)
      throw createError({ statusCode: 502, message: 'Couldn’t load this recording' })
    }
    return response
  }
}

/**
 * Recording columns, in display order. Platform admins choose which are available
 * to an account, owners and admins choose the account's defaults, and each user
 * picks their own from the available ones. Timestamp is always shown.
 */
export const RECORDING_COLUMNS = ['timestamp', 'ani', 'accountNumber', 'duration'] as const
export type RecordingColumn = typeof RECORDING_COLUMNS[number]

export const RECORDING_COLUMN_LABELS: Record<RecordingColumn, string> = {
  timestamp: 'Timestamp',
  ani: 'Caller ID',
  accountNumber: 'Account #',
  duration: 'Duration'
}

/** A recording as sent to the browser. Fields whose column isn't available are left out. */
export interface RecordingDto {
  id: string
  startedAt: string
  ani?: string | null
  accountNumber?: string
  durationSeconds?: number
}

export const DEFAULT_AVAILABLE_COLUMNS: RecordingColumn[] = ['timestamp', 'ani', 'duration']

/**
 * The old per-account history setting's default: still the column's default,
 * and a fallback before a page's config loads. History now comes from the
 * plan (planHistoryDays() in shared/utils/plans.ts).
 */
export const DEFAULT_RECORDING_HISTORY_DAYS = 365

/** The earliest moment an account can load recordings from: a rolling window ending now */
export function recordingHistoryStart(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export const SORT_DIRECTIONS = ['asc', 'desc'] as const
export type SortDirection = typeof SORT_DIRECTIONS[number]

/** Every column sorts; the first click on one goes newest/longest first, or A–Z */
export const RECORDING_SORT_DEFAULTS: Record<RecordingColumn, SortDirection> = {
  timestamp: 'desc',
  ani: 'asc',
  accountNumber: 'asc',
  duration: 'desc'
}

/** Keeps known columns in display order, always including timestamp */
export function normalizeColumns(columns: readonly string[]): RecordingColumn[] {
  return RECORDING_COLUMNS.filter(column => column === 'timestamp' || columns.includes(column))
}

/** The columns a user sees: their own choice, else the account's default, else all available */
export function resolveColumns(
  available: readonly RecordingColumn[],
  accountDefault?: readonly RecordingColumn[] | null,
  mine?: readonly RecordingColumn[] | null
) {
  const chosen = mine ?? accountDefault ?? available
  return normalizeColumns(chosen.filter(column => available.includes(column)))
}

/** 245 → "4:05", 3723 → "1:02:03" */
export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** US numbers as (269) 555-0134; anything else as given */
export function formatPhone(ani: string | null | undefined) {
  if (!ani) {
    return 'Unknown'
  }
  const digits = ani.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : ani
}

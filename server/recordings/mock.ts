import type { Recording, RecordingQuery } from '../utils/recordings'

// Mock recordings, generated deterministically from the account number and the
// day, so the same calls come back on every request without storing anything.

const DAY_MS = 86_400_000
const DAYS = 90
const AREA_CODES = ['269', '616', '313', '312', '517', '734', '248', '773', '414', '574']

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619)
  }
  return h >>> 0
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1) */
function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function agentsFor(accountNumber: string) {
  const rand = random(hash(`agents:${accountNumber}`))
  const letter = () => String.fromCharCode(65 + Math.floor(rand() * 26))
  return Array.from({ length: 10 }, () => letter() + letter() + (rand() < 0.3 ? letter() : ''))
}

const dayCache = new Map<string, Recording[]>()

/** Every call for one account number on one UTC day, newest first */
function dayRecordings(accountNumber: string, day: number): Recording[] {
  const key = `${accountNumber}:${day}`
  const cached = dayCache.get(key)
  if (cached) {
    return cached
  }

  const rand = random(hash(key))
  const agents = agentsFor(accountNumber)
  const count = 10 + Math.floor(rand() * 31)
  const recordings: Recording[] = []

  for (let i = 0; i < count; i++) {
    // Mostly 8am–7pm Eastern (12:00–23:00 UTC), with some calls overnight
    const hour = rand() < 0.85 ? 12 + Math.floor(rand() * 11) : Math.floor(rand() * 24)
    const seconds = hour * 3600 + Math.floor(rand() * 3600)
    const startedAt = new Date(day * DAY_MS + seconds * 1000)
    const ani = rand() < 0.05
      ? null
      : `${AREA_CODES[Math.floor(rand() * AREA_CODES.length)]}${2 + Math.floor(rand() * 8)}${String(Math.floor(rand() * 1e6)).padStart(6, '0')}`
    recordings.push({
      id: `${accountNumber}~${Math.floor(startedAt.getTime() / 1000)}~${i}`,
      accountNumber,
      startedAt,
      ani,
      agent: agents[Math.floor(rand() * agents.length)]!,
      // Skewed toward short calls: 15 seconds to 9 minutes
      durationSeconds: 15 + Math.floor(rand() ** 2 * 525)
    })
  }

  recordings.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
  if (dayCache.size > 5000) {
    dayCache.clear()
  }
  dayCache.set(key, recordings)
  return recordings
}

function matches(recording: Recording, query: RecordingQuery, now: number) {
  const time = recording.startedAt.getTime()
  if (time > now || (query.from && time < query.from.getTime()) || (query.to && time >= query.to.getTime())) {
    return false
  }
  if (query.accountNumber && recording.accountNumber !== query.accountNumber) {
    return false
  }
  if (query.minDuration && recording.durationSeconds < query.minDuration) {
    return false
  }
  if (query.search) {
    // Letters search agent initials; digits search the caller ID
    if (/[a-z]/i.test(query.search)) {
      return !!query.searchAgent && recording.agent.includes(query.search.replace(/[^a-z]/gi, '').toUpperCase())
    }
    const digits = query.search.replace(/\D/g, '')
    return !!query.searchAni && !!digits && !!recording.ani?.includes(digits)
  }
  return true
}

export function listMockRecordings(query: RecordingQuery) {
  const now = Date.now()
  const today = Math.floor(now / DAY_MS)
  const items: Recording[] = []
  let total = 0

  for (let day = today; day > today - DAYS; day--) {
    const recordings = query.accountNumbers
      .flatMap(accountNumber => dayRecordings(accountNumber, day))
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    for (const recording of recordings) {
      if (!matches(recording, query, now)) {
        continue
      }
      if (total >= query.offset && items.length < query.limit) {
        items.push(recording)
      }
      total++
    }
  }
  return { items, total }
}

export function getMockRecording(id: string) {
  const [accountNumber, unix] = id.split('~')
  const seconds = Number(unix)
  if (!accountNumber || !Number.isInteger(seconds)) {
    return null
  }
  const recording = dayRecordings(accountNumber, Math.floor(seconds * 1000 / DAY_MS)).find(r => r.id === id)
  return recording && recording.startedAt.getTime() <= Date.now() ? recording : null
}

const SAMPLE_RATE = 8000
const audioCache = new Map<string, Buffer>()

/**
 * An 8 kHz, 8-bit mono WAV the length of the call: two "voices" taking turns,
 * made of buzzy syllables at different pitches. Recent ones are cached because
 * browsers fetch audio in several range requests.
 */
export function mockRecordingAudio(recording: Recording) {
  const cached = audioCache.get(recording.id)
  if (cached) {
    return cached
  }

  const rand = random(hash(`audio:${recording.id}`))
  const length = recording.durationSeconds * SAMPLE_RATE
  const buffer = Buffer.alloc(44 + length)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + length, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE, 28)
  buffer.writeUInt16LE(1, 32)
  buffer.writeUInt16LE(8, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(length, 40)

  let i = 0
  let speaker = 0
  const write = (sample: number) => {
    buffer[44 + i] = Math.max(0, Math.min(255, Math.round(128 + sample * 127)))
    i++
  }

  while (i < length) {
    // One turn of 2–8 seconds
    const turnEnd = Math.min(length, i + Math.floor((2 + rand() * 6) * SAMPLE_RATE))
    const pitch = speaker === 0 ? 110 + rand() * 20 : 190 + rand() * 30
    // Each turn at its own volume, so the waveform has some shape
    const volume = (speaker === 0 ? 0.3 : 0.2) * (0.5 + rand() * 0.5)
    while (i < turnEnd) {
      const syllable = Math.floor((0.12 + rand() * 0.18) * SAMPLE_RATE)
      const f = pitch * (0.9 + rand() * 0.2)
      const stress = 0.6 + rand() * 0.4
      for (let n = 0; n < syllable && i < turnEnd; n++) {
        const t = n / SAMPLE_RATE
        const envelope = Math.sin(Math.PI * n / syllable)
        const tone = Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)
        write(volume * stress * envelope * tone / 1.75 + (rand() - 0.5) * 0.02)
      }
      const gap = Math.floor((0.03 + rand() * 0.12) * SAMPLE_RATE)
      for (let n = 0; n < gap && i < turnEnd; n++) {
        write((rand() - 0.5) * 0.02)
      }
    }
    // Pause between speakers
    const pause = Math.min(length, i + Math.floor((0.3 + rand() * 0.5) * SAMPLE_RATE))
    while (i < pause) {
      write((rand() - 0.5) * 0.02)
    }
    speaker = 1 - speaker
  }

  if (audioCache.size >= 4) {
    audioCache.delete(audioCache.keys().next().value!)
  }
  audioCache.set(recording.id, buffer)
  return buffer
}

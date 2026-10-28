/**
 * Loudness (RMS) of a PCM WAV file in `count` equal slices, scaled so the loudest
 * slice is 1. Returns an empty array for formats it can't read (anything but
 * 8- or 16-bit PCM), and the player then shows a flat waveform.
 */
export function wavPeaks(wav: Buffer, count: number): number[] {
  let format = 0
  let bits = 0
  let data: Buffer | null = null

  // Walk the RIFF chunks for the format and the samples
  let offset = wav.toString('ascii', 0, 4) === 'RIFF' ? 12 : wav.length
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4)
    const size = wav.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      format = wav.readUInt16LE(offset + 8)
      bits = wav.readUInt16LE(offset + 22)
    } else if (id === 'data') {
      data = wav.subarray(offset + 8, Math.min(wav.length, offset + 8 + size))
      break
    }
    offset += 8 + size + (size % 2)
  }

  if (!data || format !== 1 || (bits !== 8 && bits !== 16)) {
    return []
  }

  const samples = Math.floor(data.length / (bits / 8))
  const sample = bits === 8
    ? (i: number) => (data[i]! - 128) / 128
    : (i: number) => data.readInt16LE(i * 2) / 32768

  const levels = Array.from({ length: count }, (_, bar) => {
    const start = Math.floor(bar * samples / count)
    const end = Math.floor((bar + 1) * samples / count)
    let sum = 0
    for (let i = start; i < end; i++) {
      sum += sample(i) ** 2
    }
    return end > start ? Math.sqrt(sum / (end - start)) : 0
  })

  const loudest = Math.max(...levels)
  return levels.map(level => loudest ? Math.round(level / loudest * 100) / 100 : 0)
}

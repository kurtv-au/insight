/** Low, but plenty for a waveform, and it keeps a long call's decoded samples small */
const DECODE_SAMPLE_RATE = 8000

/**
 * Loudness (RMS, across all channels) of an audio file in `count` equal slices,
 * scaled so the loudest slice is 1. Browser only: decodes with Web Audio, so any
 * format the browser plays works.
 */
export async function audioPeaks(file: ArrayBuffer, count: number): Promise<number[]> {
  const decoded = await new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE).decodeAudioData(file)
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c))
  const samples = decoded.length

  const levels = Array.from({ length: count }, (_, bar) => {
    const start = Math.floor(bar * samples / count)
    const end = Math.floor((bar + 1) * samples / count)
    let sum = 0
    for (const channel of channels) {
      for (let i = start; i < end; i++) {
        sum += channel[i]! ** 2
      }
    }
    return end > start ? Math.sqrt(sum / ((end - start) * channels.length)) : 0
  })

  const loudest = Math.max(...levels)
  return levels.map(level => loudest ? Math.round(level / loudest * 100) / 100 : 0)
}

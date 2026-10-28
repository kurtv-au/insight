// Streams a recording's audio. Supports Range requests so the player can seek.
export default defineEventHandler(async (event) => {
  const { accountNumbers } = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const recording = await requireTenantRecording(getRouterParam(event, 'recordingId')!, accountNumbers)
  const audio = await recordingAudio(recording)

  setResponseHeaders(event, {
    'Content-Type': 'audio/wav',
    // Listen-only: played in the page, not offered as a download
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600'
  })

  const range = /^bytes=(\d*)-(\d*)$/.exec(getRequestHeader(event, 'range') ?? '')
  if (!range || (!range[1] && !range[2])) {
    setResponseHeader(event, 'Content-Length', audio.length)
    return audio
  }

  // "bytes=start-end", "bytes=start-" or the last N bytes with "bytes=-N"
  const start = range[1] ? Number(range[1]) : Math.max(0, audio.length - Number(range[2]))
  const end = range[1] && range[2] ? Math.min(Number(range[2]), audio.length - 1) : audio.length - 1
  if (start >= audio.length || start > end) {
    setResponseStatus(event, 416)
    setResponseHeader(event, 'Content-Range', `bytes */${audio.length}`)
    return ''
  }

  setResponseStatus(event, 206)
  setResponseHeaders(event, {
    'Content-Range': `bytes ${start}-${end}/${audio.length}`,
    'Content-Length': end - start + 1
  })
  return audio.subarray(start, end + 1)
})

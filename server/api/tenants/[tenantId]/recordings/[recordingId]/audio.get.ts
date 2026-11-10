// Streams a recording's audio, passing Range requests through so the player can seek
export default defineEventHandler(async (event) => {
  const access = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const recording = await requireTenantRecording(getRouterParam(event, 'recordingId')!, access)
  const audio = await recordingAudio(recording, getRequestHeader(event, 'range'))

  setResponseStatus(event, audio.status)
  for (const header of ['content-length', 'content-range', 'accept-ranges']) {
    const value = audio.headers.get(header)
    if (value) {
      setResponseHeader(event, header, value)
    }
  }
  // Recordings are MP3s, which storage sometimes labels as generic binary
  const type = audio.headers.get('content-type')
  setResponseHeaders(event, {
    'Content-Type': type && type !== 'application/octet-stream' ? type : 'audio/mpeg',
    // Listen-only: played in the page, not offered as a download
    'Content-Disposition': 'inline',
    // Customer audio: not left in the browser's cache after signing out
    'Cache-Control': 'private, no-store'
  })
  return audio.body ? sendStream(event, audio.body) : null
})

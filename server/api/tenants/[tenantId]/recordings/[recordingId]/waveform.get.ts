// The recording's loudness over time, drawn as the player's waveform
export default defineEventHandler(async (event) => {
  const { accountNumbers } = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const recording = await requireTenantRecording(getRouterParam(event, 'recordingId')!, accountNumbers)

  setResponseHeader(event, 'Cache-Control', 'private, max-age=3600')
  return { peaks: await recordingWaveform(recording) }
})

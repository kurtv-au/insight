export default defineEventHandler(async (event) => {
  const { accountNumbers, available } = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const recording = await requireTenantRecording(getRouterParam(event, 'recordingId')!, accountNumbers)
  return serializeRecording(recording, available)
})

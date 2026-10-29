export default defineEventHandler(async (event) => {
  const access = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const recording = await requireTenantRecording(getRouterParam(event, 'recordingId')!, access)
  return serializeRecording(recording, access.available)
})

// A tenant's message-field configuration, for the admin editor
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  return adminMessageConfig(getRouterParam(event, 'id')!)
})

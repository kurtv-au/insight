export default defineEventHandler(async (event) => {
  const invitation = await findPendingInvitation(getRouterParam(event, 'token')!)
  if (!invitation) {
    throw createError({ statusCode: 404, message: 'This invitation is invalid or has expired.' })
  }

  return {
    email: invitation.email,
    role: invitation.role,
    tenantName: invitation.tenant.name,
    accountExists: !!await findUserByEmail(invitation.email)
  }
})

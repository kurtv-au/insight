export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return {
    ...toSessionUser(user),
    hasPassword: !!user.passwordHash,
    emailVerified: !!user.emailVerifiedAt
  }
})

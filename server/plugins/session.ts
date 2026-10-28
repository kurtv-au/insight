// Validates the session against the database whenever the client fetches it, so
// disabled users and revoked sessions are signed out, and profile changes show up.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) {
      return
    }
    const user = await requireUser(event)
    session.user = toSessionUser(user)
  })
})

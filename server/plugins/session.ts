// Validates the session against the database whenever the client fetches it, so
// disabled users and revoked sessions are signed out, and profile changes show up.
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) {
      return
    }
    // On Nuxt 4 the hook gets the request's h3 event (see requestH3Event())
    const user = await requireUser(requestH3Event(event))
    session.user = toSessionUser(user)
  })
})

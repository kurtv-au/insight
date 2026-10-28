import { eq } from 'drizzle-orm'
import type { WebAuthnCredential } from '#auth-utils'

// Signs in with a discoverable passkey, so no email is needed
export default defineWebAuthnAuthenticateEventHandler({
  getOptions() {
    return { userVerification: 'preferred' }
  },
  storeChallenge: storeWebAuthnChallenge,
  getChallenge: getWebAuthnChallenge,
  async getCredential(event, credentialId) {
    await rateLimitAuth(event, 'passkey')
    const passkey = await useDb().query.passkeys.findFirst({ where: eq(tables.passkeys.id, credentialId) })
    if (!passkey) {
      throw createError({ statusCode: 400, message: 'This passkey is not registered with Insight.' })
    }
    return {
      id: passkey.id,
      userId: passkey.userId,
      publicKey: passkey.publicKey,
      counter: passkey.counter,
      backedUp: passkey.backedUp,
      transports: (passkey.transports ?? undefined) as WebAuthnCredential['transports']
    }
  },
  async onSuccess(event, { credential, authenticationInfo }) {
    const db = useDb()
    await db.update(tables.passkeys)
      .set({ counter: authenticationInfo.newCounter, lastUsedAt: new Date() })
      .where(eq(tables.passkeys.id, credential.id))

    const user = await db.query.users.findFirst({ where: eq(tables.users.id, credential.userId) })
    if (!user || user.disabledAt) {
      throw createError({ statusCode: 401, message: 'This account is disabled.' })
    }
    await startSession(event, user)
  }
})

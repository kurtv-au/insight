import { eq } from 'drizzle-orm'
import type { WebAuthnCredential } from '#auth-utils'

// Adds a passkey to the signed-in user's account
export default defineWebAuthnRegisterEventHandler({
  async validateUser(body, event) {
    const user = await requireUser(event)
    const passkeyName = typeof body.passkeyName === 'string' ? body.passkeyName.trim().slice(0, 255) : ''
    // Always register against the session's user, never the client-supplied name
    return {
      userName: user.email,
      displayName: user.name || user.email,
      userId: user.id,
      passkeyName: passkeyName || 'Passkey'
    }
  },
  getOptions() {
    return {
      rpName: useRuntimeConfig().public.appName,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred'
      }
    }
  },
  async excludeCredentials(event) {
    const user = await requireUser(event)
    const existing = await useDb().query.passkeys.findMany({ where: eq(tables.passkeys.userId, user.id) })
    return existing.map(passkey => ({
      id: passkey.id,
      transports: (passkey.transports ?? undefined) as WebAuthnCredential['transports']
    }))
  },
  storeChallenge: storeWebAuthnChallenge,
  getChallenge: getWebAuthnChallenge,
  async onSuccess(_event, { user, credential }) {
    await useDb().insert(tables.passkeys).values({
      id: credential.id,
      userId: user.userId,
      name: user.passkeyName,
      publicKey: credential.publicKey,
      counter: credential.counter,
      backedUp: credential.backedUp,
      transports: credential.transports ?? null
    })
  }
})

import { z } from 'zod'
import { loginEmail } from '../../../emails/login'

const bodySchema = z.object({
  email: emailSchema
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'email-login', email)

  const user = await findUserByEmail(email)
  if (user && !user.disabledAt) {
    const { token, code } = await createEmailToken(user.id, 'login', true)
    // Sent in the background so response time doesn't reveal whether the account exists
    event.waitUntil(
      sendEmail(user.email, loginEmail({ url: appUrl(`/auth/verify?token=${token}`), code: code! }))
        .catch(error => console.error('[auth] Failed to send login email', error))
    )
  }

  // Same response whether or not the account exists
  return { ok: true }
})

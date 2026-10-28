import { z } from 'zod'
import { passwordResetEmail } from '../../../emails/passwordReset'

const bodySchema = z.object({
  email: emailSchema
})

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, bodySchema.parse)
  await rateLimitAuth(event, 'password-forgot', email)

  const user = await findUserByEmail(email)
  if (user && !user.disabledAt) {
    const { token } = await createEmailToken(user.id, 'password_reset')
    // Sent in the background so response time doesn't reveal whether the account exists
    event.waitUntil(
      sendEmail(user.email, passwordResetEmail({ url: appUrl(`/reset-password?token=${token}`) }))
        .catch(error => console.error('[auth] Failed to send password reset email', error))
    )
  }

  // Same response whether or not the account exists
  return { ok: true }
})

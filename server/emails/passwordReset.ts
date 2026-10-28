import type { EmailMessage } from '../utils/email'
import { button, layout } from './layout'

export function passwordResetEmail({ url }: { url: string }): EmailMessage {
  return {
    subject: 'Reset your Insight password',
    html: layout(`
      <p>We received a request to reset your Insight password.</p>
      ${button(url, 'Reset password')}
      <p style="color:#64748b;font-size:14px;">This link expires in 15 minutes. If you didn't request a reset, you can ignore this email.</p>
    `),
    text: `Reset your Insight password by opening this link:\n${url}\n\nThis link expires in 15 minutes. If you didn't request a reset, you can ignore this email.`
  }
}

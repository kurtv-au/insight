import type { EmailMessage } from '../utils/email'
import { button, escapeHtml, layout } from './layout'

export function loginEmail({ url, code }: { url: string, code: string }): EmailMessage {
  return {
    subject: `Your Insight sign-in code: ${code}`,
    html: layout(`
      <p>Click the button below to sign in to Insight.</p>
      ${button(url, 'Sign in to Insight')}
      <p>Or enter this code on the sign-in page:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${escapeHtml(code)}</p>
      <p style="color:#64748b;font-size:14px;">This link and code expire in 15 minutes. If you didn't request this, you can ignore this email.</p>
    `),
    text: `Sign in to Insight by opening this link:\n${url}\n\nOr enter this code on the sign-in page: ${code}\n\nThis link and code expire in 15 minutes. If you didn't request this, you can ignore this email.`
  }
}

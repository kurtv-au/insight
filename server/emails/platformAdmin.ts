import type { EmailMessage } from '../utils/email'
import { button, escapeHtml, layout } from './layout'

export function platformAdminEmail({ url, inviterName }: { url: string, inviterName: string }): EmailMessage {
  const intro = `${inviterName} made you an admin of Insight, Answer United's customer portal. You can set up and open every customer account.`
  const how = 'Sign in with your email address and choose "Email me a sign-in link". Once you\'re in, you can set a password or add a passkey from your Account page.'
  return {
    subject: 'You\'re now an Insight admin',
    html: layout(`
      <p>${escapeHtml(intro)}</p>
      <p>${escapeHtml(how)}</p>
      ${button(url, 'Sign in to Insight')}
    `),
    text: `${intro}\n\n${how}\n\nSign in:\n${url}`
  }
}

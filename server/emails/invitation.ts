import type { EmailMessage } from '../utils/email'
import { button, escapeHtml, layout } from './layout'

export function invitationEmail({ url, tenantName, inviterName }: { url: string, tenantName: string, inviterName?: string }): EmailMessage {
  const from = inviterName ? `${inviterName} has invited you` : 'You have been invited'
  return {
    subject: `You're invited to ${tenantName} on Insight`,
    html: layout(`
      <p>${escapeHtml(from)} to join <strong>${escapeHtml(tenantName)}</strong> on Insight, the Answer United portal for your messages and call recordings.</p>
      ${button(url, 'Accept invitation')}
      <p style="color:#64748b;font-size:14px;">This invitation expires in 7 days.</p>
    `),
    text: `${from} to join ${tenantName} on Insight, the Answer United portal for your messages and call recordings.\n\nAccept the invitation:\n${url}\n\nThis invitation expires in 7 days.`
  }
}

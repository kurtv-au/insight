import type { EmailMessage } from '../utils/email'
import { escapeHtml, layout } from './layout'

interface SupportEmailInput {
  name: string
  email: string
  topic: string
  tenantName?: string
  subject: string
  message: string
}

export function supportEmail(input: SupportEmailInput): EmailMessage {
  // Keep the subject on one line whatever the form sent
  const subject = input.subject.replace(/\s+/g, ' ')
  const from = input.name ? `${input.name} <${input.email}>` : input.email
  const details: [string, string][] = [
    ['From', from],
    ['Account', input.tenantName ?? 'Not about a specific account'],
    ['Topic', input.topic]
  ]

  const rows = details.map(([label, value]) => `
    <tr>
      <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:4px 0;font-size:14px;">${escapeHtml(value)}</td>
    </tr>`).join('')

  return {
    subject: `[Insight support] ${input.topic}: ${subject}`,
    html: layout(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">${rows}</table>
      <p style="margin:0 0 8px;font-weight:600;">${escapeHtml(subject)}</p>
      <p style="margin:0;white-space:pre-wrap;">${escapeHtml(input.message)}</p>
    `),
    text: `${details.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${subject}\n\n${input.message}`
  }
}

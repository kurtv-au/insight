export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Wraps email body HTML in a minimal, client-safe layout */
export function layout(bodyHtml: string) {
  return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
    <tr><td>
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;">Insight</p>
      ${bodyHtml}
      <p style="margin:32px 0 0;font-size:12px;color:#64748b;">Answer United, Inc.</p>
    </td></tr>
  </table>
</body>
</html>`
}

export function button(href: string, label: string) {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#16348c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">${escapeHtml(label)}</a></p>`
}

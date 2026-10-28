/** Extracts a user-facing message from a $fetch error */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const err = error as { data?: { message?: string }, message?: string } | null
  return err?.data?.message || fallback
}

/** Only allows same-site relative redirects, to prevent open redirects */
export function safeRedirect(value: unknown, fallback = '/') {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) {
    return '—'
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return '—'
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  viewer: 'Viewer'
}

/** Up to two initials for an avatar, from a name or an email address */
export function initials(value: string | null | undefined) {
  const parts = (value ?? '').trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

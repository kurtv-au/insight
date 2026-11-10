/**
 * Platform admins open every account, so only addresses at Answer United's own
 * domains can be made one (NUXT_PLATFORM_ADMIN_DOMAINS, comma-separated).
 */
export const DEFAULT_PLATFORM_ADMIN_DOMAINS = 'answerunited.com'

/** "answerunited.com, Example.org" → ['answerunited.com', 'example.org'] */
export function parseEmailDomains(value: string | undefined | null): string[] {
  return (value ?? '')
    .split(',')
    .map(domain => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)
}

/** Whether the address is at exactly one of the domains (not a subdomain or lookalike) */
export function emailDomainAllowed(email: string, domains: readonly string[]) {
  const at = email.lastIndexOf('@')
  const domain = at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
  return !!domain && domains.includes(domain)
}

/** "@answerunited.com" or "@answerunited.com or @example.org", for messages */
export function describeEmailDomains(domains: readonly string[]) {
  return domains.map(domain => `@${domain}`).join(' or ')
}

import { ROLE_LABELS } from './roles'
import type { Role } from './roles'

/**
 * Changes to who can see what, recorded with who made them
 * (server/utils/audit.ts) and listed at /admin/audit.
 */
export const AUDIT_ACTIONS = [
  'admin.added',
  'admin.removed',
  'tenant.created',
  'tenant.updated',
  'tenant.deleted',
  'recording_account.added',
  'recording_account.removed',
  'message_fields.saved',
  'account.settings_changed',
  'member.role_changed',
  'member.removed',
  'invitation.sent',
  'invitation.revoked',
  'invitation.accepted',
  'filter.created',
  'filter.updated',
  'filter.deleted',
  'member.filters_changed'
] as const

export type AuditAction = typeof AUDIT_ACTIONS[number]

/** A before → after pair, for settings and roles */
export interface AuditChange {
  from: unknown
  to: unknown
}

export interface AuditEventDto {
  id: string
  createdAt: string
  actorUserId: string | null
  actorEmail: string
  action: string
  tenantId: string | null
  tenantName: string | null
  targetLabel: string | null
  details: Record<string, unknown> | null
}

function roleLabel(role: unknown) {
  return typeof role === 'string' && role in ROLE_LABELS ? ROLE_LABELS[role as Role] : String(role)
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'none'
  }
  if (Array.isArray(value)) {
    return value.length ? value.map(show).join(', ') : 'none'
  }
  return String(value)
}

const SETTING_LABELS: Record<string, string> = {
  name: 'name',
  status: 'status',
  timezone: 'timezone',
  recordingColumns: 'available recording columns',
  recordingDefaultColumns: 'default recording columns',
  recordingHistoryDays: 'history (days)'
}

/** "status from setup to active; name from A to B" */
function describeChanges(details: Record<string, unknown> | null) {
  const changes = (details?.changes ?? {}) as Record<string, AuditChange>
  const parts = Object.entries(changes).map(([key, change]) =>
    `${SETTING_LABELS[key] ?? key} from ${show(change.from)} to ${show(change.to)}`)
  return parts.length ? parts.join('; ') : 'no visible change'
}

function describeFilter(filter: unknown) {
  const f = (filter ?? {}) as { name?: string, fieldKey?: string, value?: string }
  return `“${f.name ?? ''}” (${f.fieldKey ?? ''} = ${f.value ?? ''})`
}

/**
 * What happened, as a sentence without the person who did it (shown beside
 * it). Unknown actions, say from a newer release, still read sensibly.
 */
export function describeAuditEvent(event: Pick<AuditEventDto, 'action' | 'targetLabel' | 'details' | 'tenantName'>): string {
  const target = event.targetLabel ?? 'someone'
  const details = event.details ?? {}
  const action = event.action as AuditAction
  switch (action) {
    case 'admin.added':
      return details.created ? `Made ${target} a platform admin (new sign-in)` : `Made ${target} a platform admin`
    case 'admin.removed':
      return `Removed ${target} as a platform admin`
    case 'tenant.created':
      return details.invitedOwner ? `Created the account and invited ${show(details.invitedOwner)} as owner` : 'Created the account'
    case 'tenant.updated':
      return `Changed the account’s ${describeChanges(details)}`
    case 'tenant.deleted':
      return 'Deleted the account'
    case 'recording_account.added':
      return `Connected account number ${target}`
    case 'recording_account.removed':
      return `Disconnected account number ${target}`
    case 'message_fields.saved':
      return `Saved the message setup: ${show(details.fields)} fields from account ${show(details.scriptAccountNumber)}’s script`
    case 'account.settings_changed':
      return `Changed the ${describeChanges(details)}`
    case 'member.role_changed':
      return `Changed ${target}’s role from ${roleLabel(details.from)} to ${roleLabel(details.to)}`
    case 'member.removed':
      return details.self ? `${target} left the account` : `Removed ${target} from the account`
    case 'invitation.sent':
      return `Invited ${target} as ${roleLabel(details.role).toLowerCase()}`
    case 'invitation.revoked':
      return `Cancelled ${target}’s invitation`
    case 'invitation.accepted':
      return `${target} accepted an invitation as ${roleLabel(details.role).toLowerCase()}`
    case 'filter.created':
      return `Added message filter ${describeFilter(details.filter)}`
    case 'filter.updated':
      return `Changed message filter ${describeFilter(details.before)} to ${describeFilter(details.after)}`
    case 'filter.deleted':
      return `Deleted message filter ${describeFilter(details.filter)}`
    case 'member.filters_changed':
      return Array.isArray(details.filters) && details.filters.length
        ? `Set ${target}’s message filters to ${show(details.filters)}`
        : `Removed ${target}’s message filters (they see every message)`
    default:
      return `${event.action}${event.targetLabel ? `: ${event.targetLabel}` : ''}`
  }
}

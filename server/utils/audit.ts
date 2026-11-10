/**
 * Records a change to access or setup in the audit log (/admin/audit). Call it
 * after the change has succeeded. A failure to record is logged and never fails
 * the change itself: the person's action already happened.
 */
export async function recordAudit(
  actor: { id: string, email: string },
  entry: {
    action: AuditAction
    tenant?: { id: string, name: string } | null
    target?: string | null
    details?: Record<string, unknown>
  }
) {
  try {
    await useDb().insert(tables.auditEvents).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      tenantId: entry.tenant?.id ?? null,
      tenantName: entry.tenant?.name ?? null,
      targetLabel: entry.target?.slice(0, 255) ?? null,
      details: entry.details ?? null
    })
  } catch (err) {
    console.error(`[audit] couldn’t record ${entry.action}:`, (err as Error).message)
  }
}

/** { name: { from, to } } for each key whose value changed */
export function auditChanges<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, AuditChange> = {}
  for (const [key, to] of Object.entries(after)) {
    if (to !== undefined && JSON.stringify(before[key]) !== JSON.stringify(to)) {
      changes[key] = { from: before[key], to }
    }
  }
  return changes
}

import { count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  tenantId: z.string().max(36).optional()
})

const PAGE_SIZE = 50

// The audit log, newest first, optionally for one account
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const { page, tenantId } = await getValidatedQuery(event, querySchema.parse)
  const db = useDb()
  const where = tenantId ? eq(tables.auditEvents.tenantId, tenantId) : undefined

  const [rows, [totals]] = await Promise.all([
    db.select().from(tables.auditEvents)
      .where(where)
      .orderBy(desc(tables.auditEvents.createdAt), desc(tables.auditEvents.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(tables.auditEvents).where(where)
  ])

  const items: AuditEventDto[] = rows.map(row => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    actorUserId: row.actorUserId,
    actorEmail: row.actorEmail,
    action: row.action,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    targetLabel: row.targetLabel,
    details: row.details ?? null
  }))
  return { items, total: totals?.total ?? 0, pageSize: PAGE_SIZE }
})

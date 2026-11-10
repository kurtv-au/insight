import { and, asc, count, eq, inArray } from 'drizzle-orm'

type FilterRow = typeof tables.tenantMessageFilters.$inferSelect

/**
 * The filters assigned to a member, by name. Platform admins are never
 * filtered, even where they're also a member.
 */
export async function memberMessageFilters(tenantId: string, user: { id: string, isPlatformAdmin: boolean }): Promise<Pick<FilterRow, 'id' | 'name' | 'fieldKey' | 'value'>[]> {
  if (user.isPlatformAdmin) {
    return []
  }
  const filters = tables.tenantMessageFilters
  const assigned = tables.membershipMessageFilters
  return useDb()
    .select({ id: filters.id, name: filters.name, fieldKey: filters.fieldKey, value: filters.value })
    .from(assigned)
    .innerJoin(filters, eq(filters.id, assigned.filterId))
    .where(and(eq(assigned.tenantId, tenantId), eq(assigned.userId, user.id)))
    .orderBy(asc(filters.name))
}

/**
 * What a member may see of the tenant's messages: null for everything, or the
 * match every message route must pass to the message source.
 */
export async function memberMessageMatch(tenantId: string, user: { id: string, isPlatformAdmin: boolean }) {
  return buildMessageMatch(await memberMessageFilters(tenantId, user))
}

/**
 * The fields a filter can use: every field in the account's message setup
 * that's still in its script, visible or not.
 */
export async function messageFilterFields(tenantId: string) {
  const { fields } = await loadMessageConfig(tenantId)
  return fields
    .filter(field => !field.orphaned && isRetrievableFieldKey(field.fieldKey))
    .map(field => ({ fieldKey: field.fieldKey, label: field.label }))
}

/** A tenant's filters, by name, with how many members each applies to */
export async function listMessageFilters(tenantId: string): Promise<MessageFilterDto[]> {
  const db = useDb()
  const filters = tables.tenantMessageFilters
  const assigned = tables.membershipMessageFilters
  const [rows, counts, fields] = await Promise.all([
    db.select().from(filters).where(eq(filters.tenantId, tenantId)).orderBy(asc(filters.name)),
    db.select({ filterId: assigned.filterId, members: count() })
      .from(assigned)
      .where(eq(assigned.tenantId, tenantId))
      .groupBy(assigned.filterId),
    messageFilterFields(tenantId)
  ])
  const members = new Map(counts.map(row => [row.filterId, row.members]))
  const usable = new Set(fields.map(field => canonicalFieldKey(field.fieldKey)))
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    fieldKey: row.fieldKey,
    value: row.value,
    members: members.get(row.id) ?? 0,
    orphaned: !usable.has(canonicalFieldKey(row.fieldKey))
  }))
}

/** One of the tenant's filters, or a 404 */
export async function requireMessageFilter(tenantId: string, filterId: string) {
  const filter = await useDb().query.tenantMessageFilters.findFirst({
    where: and(eq(tables.tenantMessageFilters.id, filterId), eq(tables.tenantMessageFilters.tenantId, tenantId))
  })
  if (!filter) {
    throw createError({ statusCode: 404, message: 'Filter not found' })
  }
  return filter
}

/**
 * Checks a filter about to be saved: its field must be one the account's
 * script has (stored in the setup's spelling), and its name must be unused.
 */
export async function validateMessageFilter(tenantId: string, input: MessageFilterInput, exceptId?: string) {
  const fields = await messageFilterFields(tenantId)
  const field = fields.find(f => canonicalFieldKey(f.fieldKey) === canonicalFieldKey(input.fieldKey))
  if (!field) {
    throw createError({ statusCode: 400, message: 'Choose a field from the account’s message setup' })
  }
  const existing = await useDb().select({ id: tables.tenantMessageFilters.id, name: tables.tenantMessageFilters.name })
    .from(tables.tenantMessageFilters)
    .where(eq(tables.tenantMessageFilters.tenantId, tenantId))
  if (existing.length >= MAX_MESSAGE_FILTERS && !exceptId) {
    throw createError({ statusCode: 400, message: `An account can have at most ${MAX_MESSAGE_FILTERS} filters` })
  }
  const name = input.name.toLowerCase()
  if (existing.some(row => row.id !== exceptId && row.name.toLowerCase() === name)) {
    throw createError({ statusCode: 409, message: 'There’s already a filter with that name' })
  }
  return { name: input.name, fieldKey: field.fieldKey, value: input.value }
}

/**
 * Deletes a filter, unless that would leave someone with no filters, which
 * would widen what they can see to every message.
 */
export async function deleteMessageFilter(tenantId: string, filterId: string) {
  const assigned = tables.membershipMessageFilters
  await useDb().transaction(async (tx) => {
    const holders = await tx.select({ userId: assigned.userId })
      .from(assigned)
      .where(and(eq(assigned.tenantId, tenantId), eq(assigned.filterId, filterId)))
      .for('update')
    if (holders.length) {
      const userIds = holders.map(row => row.userId)
      const totals = await tx.select({ userId: assigned.userId, filters: count() })
        .from(assigned)
        .where(and(eq(assigned.tenantId, tenantId), inArray(assigned.userId, userIds)))
        .groupBy(assigned.userId)
      const onlyFilter = totals.filter(row => row.filters <= 1).length
      if (onlyFilter) {
        throw createError({
          statusCode: 409,
          message: `This is the only filter for ${onlyFilter === 1 ? '1 person' : `${onlyFilter} people`}. Removing it would show them every message, so change their filters on the Members page first.`
        })
      }
    }
    await tx.delete(tables.tenantMessageFilters)
      .where(and(eq(tables.tenantMessageFilters.id, filterId), eq(tables.tenantMessageFilters.tenantId, tenantId)))
  })
}

/**
 * Replaces a member's filters, returning them. Every id must be one of the
 * tenant's, and together they must fit au-api's `match` limits.
 */
export async function setMemberMessageFilters(tenantId: string, userId: string, filterIds: string[]) {
  const db = useDb()
  const rows = filterIds.length
    ? await db.select().from(tables.tenantMessageFilters)
        .where(and(eq(tables.tenantMessageFilters.tenantId, tenantId), inArray(tables.tenantMessageFilters.id, filterIds)))
    : []
  if (rows.length !== filterIds.length) {
    throw createError({ statusCode: 400, message: 'One of those filters no longer exists. Reload and try again.' })
  }
  const problem = messageMatchProblem(buildMessageMatch(rows))
  if (problem) {
    throw createError({ statusCode: 400, message: problem })
  }
  const assigned = tables.membershipMessageFilters
  await db.transaction(async (tx) => {
    await tx.delete(assigned).where(and(eq(assigned.tenantId, tenantId), eq(assigned.userId, userId)))
    if (filterIds.length) {
      await tx.insert(assigned).values(filterIds.map(filterId => ({ tenantId, userId, filterId })))
    }
  })
  return rows
}

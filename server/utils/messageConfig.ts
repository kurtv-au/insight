import { asc, eq } from 'drizzle-orm'

type MessageFieldRow = typeof tables.tenantMessageFields.$inferSelect

function toSavedField(row: MessageFieldRow): SavedMessageField {
  return {
    fieldKey: row.fieldKey,
    label: row.label,
    type: row.type,
    format: row.format,
    order: row.position,
    showInList: row.showInList,
    showInDetail: row.showInDetail,
    isActive: row.isActive,
    showIfOrphaned: row.showIfOrphaned,
    orphaned: row.orphaned,
    sourceScriptId: row.sourceScriptId,
    sourceScriptVersion: row.sourceScriptVersion
  }
}

/** A tenant's message settings and fields, in order */
export async function loadMessageConfig(tenantId: string) {
  const db = useDb()
  const [settings, rows] = await Promise.all([
    db.query.tenantMessageSettings.findFirst({ where: eq(tables.tenantMessageSettings.tenantId, tenantId) }),
    db.query.tenantMessageFields.findMany({
      where: eq(tables.tenantMessageFields.tenantId, tenantId),
      orderBy: asc(tables.tenantMessageFields.position)
    })
  ])
  return { settings: settings ?? null, fields: rows.map(toSavedField) }
}

/** The fields the messages page shows, without admin-only state */
export async function visibleMessageFields(tenantId: string): Promise<MessageColumnField[]> {
  const { fields } = await loadMessageConfig(tenantId)
  return fields.filter(isVisibleOnMessages).map(field => ({
    fieldKey: field.fieldKey,
    label: field.label,
    type: field.type,
    format: field.format,
    order: field.order,
    showInList: field.showInList,
    showInDetail: field.showInDetail
  }))
}

/** Everything the admin editor needs for one tenant, or a 404 */
export async function adminMessageConfig(tenantId: string) {
  const db = useDb()
  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, tenantId) })
  if (!tenant) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  const [accounts, { settings, fields }] = await Promise.all([
    db.query.tenantRecordingAccounts.findMany({
      where: eq(tables.tenantRecordingAccounts.tenantId, tenantId),
      orderBy: asc(tables.tenantRecordingAccounts.accountNumber)
    }),
    loadMessageConfig(tenantId)
  ])
  const updatedBy = settings?.updatedByUserId
    ? await db.query.users.findFirst({ where: eq(tables.users.id, settings.updatedByUserId), columns: { name: true, email: true } })
    : null

  return {
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, timezone: tenant.timezone },
    accountNumbers: accounts.map(account => account.accountNumber),
    settings: {
      scriptAccountNumber: settings?.scriptAccountNumber ?? null,
      scriptId: settings?.scriptId ?? null,
      scriptVersion: settings?.scriptVersion ?? null,
      knownFieldKeys: settings?.knownFieldKeys ?? [],
      revision: settings?.revision ?? 0,
      updatedAt: settings?.updatedAt.toISOString() ?? null,
      updatedBy: updatedBy ? (updatedBy.name || updatedBy.email) : null
    },
    fields
  }
}

/** The MySQL error code under drizzle's wrapper */
function mysqlCode(err: unknown) {
  const e = err as { code?: string, cause?: { code?: string } }
  return e.cause?.code ?? e.code
}

/**
 * Replaces a tenant's whole message-field configuration in one transaction.
 *
 * The settings row is locked first and its revision compared with the one the
 * editor loaded, so two admins can't silently overwrite each other; then every
 * field row is deleted and the new set inserted, so the order can never be left
 * half-written.
 *
 * Orphan state and source ids are worked out here against `script` (the
 * account's active script, fetched by the caller), not trusted from the client:
 * - script present and complete: a field not in it is orphaned
 * - no active script (null): every field is orphaned
 * - script incomplete: a field missing from it may still exist, so its previous
 *   state carries over
 */
export async function saveMessageFieldConfig(input: {
  tenantId: string
  userId: string
  revision: number
  scriptAccountNumber: string | null
  fields: MessageFieldInput[]
  script: ActiveScriptDto | null
}) {
  const { tenantId, script } = input
  const settingsTable = tables.tenantMessageSettings
  const fieldsTable = tables.tenantMessageFields

  try {
    await useDb().transaction(async (tx) => {
      const [current] = await tx.select({ revision: settingsTable.revision, knownFieldKeys: settingsTable.knownFieldKeys })
        .from(settingsTable)
        .where(eq(settingsTable.tenantId, tenantId))
        .for('update')
      if ((current?.revision ?? 0) !== input.revision) {
        throw createError({ statusCode: 409, message: 'Someone else saved these fields since you opened them. Reload to see their changes.' })
      }

      const previous = new Map((await tx.select().from(fieldsTable).where(eq(fieldsTable.tenantId, tenantId)))
        .map(row => [canonicalFieldKey(row.fieldKey), row]))
      const inScript = new Set((script?.fields ?? []).map(field => canonicalFieldKey(field.key)))

      const settings = {
        scriptAccountNumber: input.scriptAccountNumber,
        scriptId: script?.scriptId ?? null,
        scriptVersion: script?.versionNumber ?? null,
        // Without a script there's nothing new to compare with next time; keep what we knew
        knownFieldKeys: script ? [...inScript] : (current?.knownFieldKeys ?? []),
        revision: (current?.revision ?? 0) + 1,
        updatedByUserId: input.userId
      }
      if (current) {
        await tx.update(settingsTable).set(settings).where(eq(settingsTable.tenantId, tenantId))
      } else {
        await tx.insert(settingsTable).values({ tenantId, ...settings })
      }

      await tx.delete(fieldsTable).where(eq(fieldsTable.tenantId, tenantId))
      if (input.fields.length) {
        await tx.insert(fieldsTable).values(input.fields.map((field) => {
          const key = canonicalFieldKey(field.fieldKey)
          const before = previous.get(key)
          const present = inScript.has(key)
          const orphaned = !script ? true : script.complete ? !present : (present ? false : (before?.orphaned ?? false))
          return {
            tenantId,
            fieldKey: field.fieldKey.trim(),
            label: field.label,
            type: field.type,
            format: field.format,
            position: field.order,
            showInList: field.showInList,
            showInDetail: field.showInDetail,
            isActive: field.isActive,
            orphaned,
            showIfOrphaned: field.showIfOrphaned,
            sourceScriptId: present ? script!.scriptId : (before?.sourceScriptId ?? null),
            sourceScriptVersion: present ? script!.versionNumber : (before?.sourceScriptVersion ?? null),
            updatedByUserId: input.userId
          }
        }))
      }
    })
  } catch (err) {
    // A concurrent first save, or two keys MySQL's collation treats as equal (e.g. accents)
    const code = mysqlCode(err)
    if (code === 'ER_DUP_ENTRY' || code === 'ER_LOCK_DEADLOCK') {
      throw createError({
        statusCode: 409,
        message: 'These fields couldn’t be saved because two of them clash, or someone else saved at the same moment. Reload and try again.'
      })
    }
    throw err
  }
}

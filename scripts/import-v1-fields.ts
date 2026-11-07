// One-off: message fields for the tenants imported by `pnpm import:v1`, from
// v1's dynamic_fields.csv and each account's live au-api script.
// Usage: pnpm import:v1-fields <export-dir> [--apply]
//
// Dry run by default: prints what each tenant would get. --apply writes it all
// in one transaction, as a first save in the message-fields editor would.
// Tenants that already have a configuration are never touched, so re-running
// is safe. Prints v1 ids, slugs and field names only; never the au-api key or
// the database URL. See docs/DEPLOYMENT.md, "One-off v1 import".
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../server/db/schema.ts'
import { parseCsv } from './import-v1/csv.ts'

// Values already in the environment win over .env
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const unknownFlags = args.filter(arg => arg.startsWith('--') && arg !== '--apply')
const [dir] = args.filter(arg => !arg.startsWith('--'))
if (!dir || unknownFlags.length) {
  console.error('Usage: pnpm import:v1-fields <export-dir> [--apply]')
  process.exit(1)
}

const databaseUrl = process.env.NUXT_DATABASE_URL
const auApiKey = process.env.NUXT_AU_API_KEY
const auApiUrl = (process.env.NUXT_AU_API_URL || 'https://api.answerunited.net').replace(/\/+$/, '')
if (!databaseUrl || !auApiKey) {
  console.error('NUXT_DATABASE_URL and NUXT_AU_API_KEY must both be set')
  process.exit(1)
}
// Checked here so a bad URL never reaches an error message: it holds the password
let target: URL
try {
  target = new URL(databaseUrl)
  new URL(auApiUrl)
} catch {
  console.error('NUXT_DATABASE_URL or NUXT_AU_API_URL is not a valid URL. URL-encode the database password (see docs/DEPLOYMENT.md, "One-off v1 import").')
  process.exit(1)
}

// schemas.ts needs the Nuxt auto-imports as globals before it loads
await import('./import-v1/globals.ts')
const { buildImportPlan, ImportError } = await import('./import-v1/map.ts')
const { buildFieldConfig, groupV1MessageFields } = await import('./import-v1/fields.ts')
const { messageFieldConfigInputSchema, canonicalFieldKey, cleanScriptLabels } = await import('../shared/utils/messageFields.ts')
const { toActiveScriptDto } = await import('../server/scripts/au-api.ts')
type ActiveScript = import('../shared/utils/messageFields.ts').ActiveScriptDto
type ApiActiveScript = import('../server/scripts/au-api.ts').ApiActiveScript
type FieldInput = import('../shared/utils/messageFields.ts').MessageFieldInput

function readCsv(name: string) {
  const path = join(dir!, name)
  if (!existsSync(path)) {
    console.error(`${path} not found`)
    process.exit(1)
  }
  return parseCsv(readFileSync(path, 'utf8'))
}

/** The account's active script, as the app reads it (server/scripts/au-api.ts) */
async function activeScript(accountNumber: string): Promise<ActiveScript | 'no_script' | 'unknown_account'> {
  const response = await fetch(`${auApiUrl}/v1/scripts/active?clientNumber=${encodeURIComponent(accountNumber)}`, {
    headers: { Authorization: `Bearer ${auApiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000)
  })
  if (response.status === 404) {
    return 'unknown_account'
  }
  if (!response.ok) {
    throw new Error(`au-api answered ${response.status} for account number ${accountNumber}; nothing was written`)
  }
  const body = await response.json() as { data: { script: ApiActiveScript | null } }
  return body.data.script ? cleanScriptLabels(toActiveScriptDto(body.data.script)) : 'no_script'
}

// Which tenant each v1 account became: its account numbers, as the account import mapped them
let tenantPlan: ReturnType<typeof buildImportPlan>
try {
  tenantPlan = buildImportPlan({ accounts: readCsv('accounts.csv'), users: [], userFilters: [] })
} catch (err) {
  console.error(err instanceof ImportError ? err.message : err)
  process.exit(1)
}
const layouts = groupV1MessageFields(readCsv('dynamic_fields.csv'))

console.info(`Database: ${target.hostname}${target.port ? `:${target.port}` : ''}${target.pathname}`)
console.info(`au-api:   ${new URL(auApiUrl).host}`)
console.info('')

const pool = createPool({ uri: databaseUrl, timezone: 'Z' })
const db = drizzle({ client: pool, schema, mode: 'default' })
const { tenants, tenantRecordingAccounts, tenantMessageSettings, tenantMessageFields } = schema

interface Planned {
  tenantId: string
  accountNumber: string
  script: ActiveScript
  fields: FieldInput[]
}

try {
  const numbers = tenantPlan.tenants.map(t => t.accountNumbers[0]!)
  const accounts = await db.select({ accountNumber: tenantRecordingAccounts.accountNumber, tenantId: tenants.id, slug: tenants.slug })
    .from(tenantRecordingAccounts)
    .innerJoin(tenants, eq(tenants.id, tenantRecordingAccounts.tenantId))
    .where(inArray(tenantRecordingAccounts.accountNumber, numbers))
  const tenantByNumber = new Map(accounts.map(a => [a.accountNumber, a]))
  const tenantIds = accounts.map(a => a.tenantId)
  const configured = new Set([
    ...(tenantIds.length ? await db.select({ id: tenantMessageSettings.tenantId }).from(tenantMessageSettings).where(inArray(tenantMessageSettings.tenantId, tenantIds)) : []),
    ...(tenantIds.length ? await db.select({ id: tenantMessageFields.tenantId }).from(tenantMessageFields).where(inArray(tenantMessageFields.tenantId, tenantIds)) : [])
  ].map(row => row.id))

  const planned: Planned[] = []
  const skipped = new Map<string, number>()
  const skip = (v1Id: string, slug: string, reason: string) => {
    console.info(`account ${v1Id} ${slug}: skipped, ${reason}`)
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1)
  }
  let missingTotal = 0

  for (const v1Tenant of tenantPlan.tenants) {
    const accountNumber = v1Tenant.accountNumbers[0]!
    const tenant = tenantByNumber.get(accountNumber)
    if (!tenant) {
      skip(v1Tenant.v1Id, `#${accountNumber}`, 'no tenant has this account number')
      continue
    }
    const layout = layouts.get(v1Tenant.v1Id)
    if (!layout || (!layout.list.length && !layout.detail.length)) {
      skip(v1Tenant.v1Id, tenant.slug, 'no v1 message fields')
      continue
    }
    if (configured.has(tenant.tenantId)) {
      skip(v1Tenant.v1Id, tenant.slug, 'already configured')
      continue
    }
    const script = await activeScript(accountNumber)
    if (script === 'unknown_account') {
      skip(v1Tenant.v1Id, tenant.slug, `au-api doesn't know account number ${accountNumber}`)
      continue
    }
    if (script === 'no_script') {
      skip(v1Tenant.v1Id, tenant.slug, 'no active script')
      continue
    }

    const result = buildFieldConfig(layout, script)
    if (!result.fields.length) {
      skip(v1Tenant.v1Id, tenant.slug, 'none of its v1 fields are in the script')
      continue
    }
    const parsed = messageFieldConfigInputSchema.safeParse({ revision: 0, scriptAccountNumber: accountNumber, fields: result.fields })
    if (!parsed.success) {
      skip(v1Tenant.v1Id, tenant.slug, `invalid configuration: ${parsed.error.issues.map(i => i.message).join('; ')}`)
      continue
    }

    missingTotal += result.missing.length
    const listCount = result.fields.filter(f => f.showInList).length
    const detailCount = result.fields.filter(f => f.showInDetail).length
    console.info(`account ${v1Tenant.v1Id} ${tenant.slug}: ${result.fields.length} ${result.fields.length === 1 ? 'field' : 'fields'} (${listCount} in list, ${detailCount} in detail) from script ${script.scriptId} v${script.versionNumber}${script.complete ? '' : ' (incomplete)'}`)
    if (result.missing.length) {
      console.info(`    not in the script, left out: ${result.missing.join(', ')}`)
    }
    if (result.unretrievable.length) {
      console.info(`    au-api can't load: ${result.unretrievable.join(', ')}`)
    }
    planned.push({ tenantId: tenant.tenantId, accountNumber, script, fields: parsed.data.fields })
  }

  console.info('')
  console.info(`To configure: ${planned.length} tenants, ${planned.reduce((n, p) => n + p.fields.length, 0)} fields (${missingTotal} v1 fields not in their scripts)`)
  for (const [reason, count] of skipped) {
    console.info(`Skipped:      ${count} × ${reason}`)
  }

  if (!apply) {
    console.info('\nDry run: nothing written. Re-run with --apply to save these configurations.')
  } else if (!planned.length) {
    console.info('\nNothing to save.')
  } else {
    // As saveMessageFieldConfig (server/utils/messageConfig.ts) does for a first save
    await db.transaction(async (tx) => {
      for (const p of planned) {
        const [current] = await tx.select({ revision: tenantMessageSettings.revision }).from(tenantMessageSettings)
          .where(eq(tenantMessageSettings.tenantId, p.tenantId)).for('update')
        const [existingField] = await tx.select({ key: tenantMessageFields.fieldKey }).from(tenantMessageFields)
          .where(eq(tenantMessageFields.tenantId, p.tenantId)).limit(1)
        if (current || existingField) {
          throw new Error('A tenant was configured while this ran; nothing was written. Run it again.')
        }
        await tx.insert(tenantMessageSettings).values({
          tenantId: p.tenantId,
          scriptAccountNumber: p.accountNumber,
          scriptId: p.script.scriptId,
          scriptVersion: p.script.versionNumber,
          knownFieldKeys: [...new Set(p.script.fields.map(f => canonicalFieldKey(f.key)))],
          revision: 1,
          updatedByUserId: null
        })
        await tx.insert(tenantMessageFields).values(p.fields.map(field => ({
          tenantId: p.tenantId,
          fieldKey: field.fieldKey.trim(),
          label: field.label,
          type: field.type,
          format: field.format,
          position: field.order,
          showInList: field.showInList,
          showInDetail: field.showInDetail,
          isActive: field.isActive,
          orphaned: false,
          showIfOrphaned: field.showIfOrphaned,
          sourceScriptId: p.script.scriptId,
          sourceScriptVersion: p.script.versionNumber,
          updatedByUserId: null
        })))
      }
    })
    console.info(`\nSaved message fields for ${planned.length} tenants.`)
  }
} finally {
  await pool.end()
}

/**
 * Builds a tenant's message-field configuration from v1's dynamic_fields.csv
 * and the account's live au-api script. Pure: no database, no network.
 *
 * v1 kept each account's message fields (module 2) in three lists:
 * - target 1: the list columns (short, usually Call Time plus a name)
 * - target 2: the detail view, whose order and captions were maintained
 * - target 3: a secondary copy (print/email), near-identical to target 2 but
 *   with stale captions; not imported
 *
 * Each field is matched case-insensitively to the script and built the way the
 * editor adds one (newFieldFromScript), with v1's caption and list/detail
 * placement. v1 fields the script no longer has are left out and reported.
 */
import {
  canonicalFieldKey,
  defaultFormatFor,
  defaultTypeForScriptField,
  humanizeFieldKey,
  isRetrievableFieldKey
} from '../../shared/utils/messageFields.ts'
import type { ActiveScriptDto, MessageFieldConfig } from '../../shared/utils/messageFields.ts'
import type { CsvRow } from './map.ts'

/** v1's module id for messages (1 is call recordings) */
const MESSAGES_MODULE = '2'
const LIST_TARGET = '1'
const DETAIL_TARGET = '2'

export interface V1Field {
  name: string
  caption: string
}

export interface V1FieldLayout {
  list: V1Field[]
  detail: V1Field[]
}

export interface FieldConfigResult {
  fields: MessageFieldConfig[]
  /** v1 field names the script doesn't have */
  missing: string[]
  /** Script keys au-api can't be asked for; they would show as empty */
  unretrievable: string[]
}

/**
 * Message fields per v1 account id: target 1 as the list, target 2 as the
 * detail view, each in layout order. Blank names are dropped and a name
 * repeated within a list keeps its first position.
 */
export function groupV1MessageFields(rows: CsvRow[]): Map<string, V1FieldLayout> {
  const byAccount = new Map<string, V1FieldLayout>()
  const sorted = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.module_id?.trim() === MESSAGES_MODULE && (row.target?.trim() === LIST_TARGET || row.target?.trim() === DETAIL_TARGET))
    .sort((a, b) => (Number(a.row.layout_order) || 0) - (Number(b.row.layout_order) || 0) || a.index - b.index)

  for (const { row } of sorted) {
    const name = (row.name ?? '').trim()
    if (!name) {
      continue
    }
    const accountId = (row.account_id ?? '').trim()
    const layout = byAccount.get(accountId) ?? { list: [], detail: [] }
    byAccount.set(accountId, layout)
    const list = row.target!.trim() === LIST_TARGET ? layout.list : layout.detail
    if (!list.some(field => canonicalFieldKey(field.name) === canonicalFieldKey(name))) {
      list.push({ name, caption: (row.caption ?? '').replace(/\s+/g, ' ').trim() })
    }
  }
  return byAccount
}

/**
 * The configuration for one tenant: detail fields in v1 order, then list-only
 * fields. Order runs 0..n-1, every field is active.
 */
export function buildFieldConfig(layout: V1FieldLayout, script: ActiveScriptDto): FieldConfigResult {
  const scriptFields = new Map<string, ActiveScriptDto['fields'][number]>()
  for (const field of script.fields) {
    const key = canonicalFieldKey(field.key)
    if (!scriptFields.has(key)) {
      scriptFields.set(key, field)
    }
  }

  const inList = new Map(layout.list.map(field => [canonicalFieldKey(field.name), field]))
  const inDetail = new Map(layout.detail.map(field => [canonicalFieldKey(field.name), field]))
  const ordered = [...layout.detail, ...layout.list.filter(field => !inDetail.has(canonicalFieldKey(field.name)))]

  const fields: MessageFieldConfig[] = []
  const missing: string[] = []
  const unretrievable: string[] = []
  for (const v1Field of ordered) {
    const key = canonicalFieldKey(v1Field.name)
    const scriptField = scriptFields.get(key)
    if (!scriptField) {
      missing.push(v1Field.name)
      continue
    }
    const type = defaultTypeForScriptField(scriptField)
    const label = inDetail.get(key)?.caption || inList.get(key)?.caption || scriptField.label?.trim() || humanizeFieldKey(scriptField.key)
    fields.push({
      fieldKey: scriptField.key,
      label: label.slice(0, 255),
      type,
      format: defaultFormatFor(type, scriptField),
      order: fields.length,
      showInList: inList.has(key),
      showInDetail: inDetail.has(key),
      isActive: true,
      showIfOrphaned: false
    })
    if (!isRetrievableFieldKey(scriptField.key)) {
      unretrievable.push(scriptField.key)
    }
  }
  return { fields, missing, unretrievable }
}

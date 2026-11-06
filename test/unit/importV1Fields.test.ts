import { describe, expect, it } from 'vitest'
import { buildFieldConfig, groupV1MessageFields } from '../../scripts/import-v1/fields'
import type { CsvRow } from '../../scripts/import-v1/map'
import { messageFieldConfigInputSchema } from '../../shared/utils/messageFields'
import type { ActiveScriptDto, ScriptFieldDto } from '../../shared/utils/messageFields'

/**
 * Message fields for imported v1 tenants (scripts/import-v1-fields.ts): v1's
 * dynamic_fields.csv rows plus the live script become the same configuration
 * the editor would save. Synthetic rows and scripts only.
 */

let nextId = 1
function v1(target: '1' | '2' | '3', name: string, caption: string, layoutOrder: number, overrides: Partial<CsvRow> = {}): CsvRow {
  return { id: String(nextId++), account_id: '10', module_id: '2', target, name, caption, layout_order: String(layoutOrder), field_presentation: 'STRING', ...overrides }
}

function scriptField(key: string, overrides: Partial<ScriptFieldDto> = {}): ScriptFieldDto {
  return { key, label: null, inputType: 'text', required: false, choices: null, checkbox: null, sources: ['screen'], screens: ['Main'], ...overrides }
}

function script(fields: ScriptFieldDto[]): ActiveScriptDto {
  return { scriptId: 7000, name: 'Call-offs', versionNumber: 12, modifiedAt: null, complete: true, fields }
}

describe('groupV1MessageFields', () => {
  it('keeps messages targets 1 and 2 per account, in layout order', () => {
    const layouts = groupV1MessageFields([
      v1('2', 'LASTNAME', 'Last', 2),
      v1('2', 'FIRSTNAME', 'First', 1),
      v1('1', 'CALLTIME', 'Call Time', 0),
      v1('3', 'PRINTONLY', 'Print only', 0),
      v1('2', 'CallTime', 'Recording field', 0, { module_id: '1' }),
      v1('2', 'OTHER', 'Other account', 0, { account_id: '11' })
    ])
    expect(layouts.get('10')).toEqual({
      list: [{ name: 'CALLTIME', caption: 'Call Time' }],
      detail: [{ name: 'FIRSTNAME', caption: 'First' }, { name: 'LASTNAME', caption: 'Last' }]
    })
    expect(layouts.get('11')!.detail.map(f => f.name)).toEqual(['OTHER'])
  })

  it('drops blank names, keeps the first of a repeated name, and tidies captions', () => {
    const layouts = groupV1MessageFields([
      v1('2', '', 'New Field', 0),
      v1('2', 'ABSENCEDATE', 'What  day? ', 1),
      v1('2', 'absencedate', 'Again', 2)
    ])
    expect(layouts.get('10')!.detail).toEqual([{ name: 'ABSENCEDATE', caption: 'What day?' }])
  })
})

describe('buildFieldConfig', () => {
  it('builds list and detail fields from targets 1 and 2 with the script spelling and v1 captions', () => {
    const layout = groupV1MessageFields([
      v1('1', 'CALLTIME', 'Call Time', 0),
      v1('1', 'EMPLOYEENAME', 'Employee', 1),
      v1('2', 'CALLTIME', 'Call Time', 0),
      v1('2', 'MESSAGE', 'Brief explanation', 1),
      v1('2', 'PHONE', '', 2)
    ]).get('10')!
    const result = buildFieldConfig(layout, script([
      scriptField('CallTime'),
      scriptField('Message', { inputType: 'multiline' }),
      scriptField('Phone', { inputType: 'phone', label: 'Callback phone' }),
      scriptField('EmployeeName')
    ]))
    expect(result.missing).toEqual([])
    expect(result.fields).toEqual([
      { fieldKey: 'CallTime', label: 'Call Time', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true, isActive: true, showIfOrphaned: false },
      { fieldKey: 'Message', label: 'Brief explanation', type: 'longText', format: { listMaxChars: 80 }, order: 1, showInList: false, showInDetail: true, isActive: true, showIfOrphaned: false },
      { fieldKey: 'Phone', label: 'Callback phone', type: 'phone', format: { style: 'national' }, order: 2, showInList: false, showInDetail: true, isActive: true, showIfOrphaned: false },
      { fieldKey: 'EmployeeName', label: 'Employee', type: 'text', format: {}, order: 3, showInList: true, showInDetail: false, isActive: true, showIfOrphaned: false }
    ])
    expect(messageFieldConfigInputSchema.safeParse({ revision: 0, scriptAccountNumber: '626', fields: result.fields }).success).toBe(true)
  })

  it('leaves out fields the script no longer has and reports them', () => {
    const layout = { list: [], detail: [{ name: 'CALLTIME', caption: 'Call Time' }, { name: 'COVID19TRAVEL', caption: 'Travel?' }] }
    const result = buildFieldConfig(layout, script([scriptField('CALLTIME')]))
    expect(result.fields.map(f => [f.fieldKey, f.order])).toEqual([['CALLTIME', 0]])
    expect(result.missing).toEqual(['COVID19TRAVEL'])
  })

  it('takes select options from the script, and falls back to text for a list without choices', () => {
    const layout = { list: [], detail: [{ name: 'URGENT', caption: 'Urgent?' }, { name: 'DEPT', caption: 'Department' }] }
    const result = buildFieldConfig(layout, script([
      scriptField('URGENT', { inputType: 'list', choices: [{ value: 'Y', label: 'Yes' }, { value: 'N', label: '' }] }),
      scriptField('DEPT', { inputType: 'list', choices: [] })
    ]))
    expect(result.fields.map(f => [f.type, f.format])).toEqual([
      ['select', { options: [{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'N' }] }],
      ['text', {}]
    ])
    expect(messageFieldConfigInputSchema.safeParse({ revision: 0, scriptAccountNumber: '1', fields: result.fields }).success).toBe(true)
  })

  it('reports script keys au-api cannot be asked for', () => {
    const result = buildFieldConfig({ list: [], detail: [{ name: '__internal', caption: 'Internal' }] }, script([scriptField('__internal')]))
    expect(result.unretrievable).toEqual(['__internal'])
  })
})

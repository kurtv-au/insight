import { describe, expect, it } from 'vitest'
import {
  defaultTypeForScriptField,
  detailFields,
  diffScriptFields,
  isVisibleOnMessages,
  listFields,
  newFieldFromScript,
  sampleMessageRows
} from '../../shared/utils/messageFields'
import type { ActiveScriptDto, ScriptFieldDto } from '../../shared/utils/messageFields'

function scriptField(key: string, overrides: Partial<ScriptFieldDto> = {}): ScriptFieldDto {
  return { key, label: key, inputType: 'text', required: false, choices: null, checkbox: null, sources: ['screen'], screens: ['Begin'], ...overrides }
}

function script(fields: ScriptFieldDto[], overrides: Partial<ActiveScriptDto> = {}): ActiveScriptDto {
  return { scriptId: 1, name: 'Main', versionNumber: 3, modifiedAt: null, complete: true, fields, ...overrides }
}

describe('diffScriptFields', () => {
  const active = script([
    scriptField('FirstName'),
    scriptField('Phone', { inputType: 'phone' }),
    scriptField('CallType', { inputType: 'list', choices: [{ value: 'a', label: 'A' }] }),
    scriptField('Urgent', { inputType: 'checkbox' })
  ])

  it('marks script fields added, new or available', () => {
    const drift = diffScriptFields({
      configured: [{ fieldKey: 'phone', type: 'phone' }],
      script: active,
      knownKeys: ['FirstName', 'Phone', 'CallType']
    })
    expect(drift.available.map(field => [field.key, field.state])).toEqual([
      ['FirstName', 'available'],
      ['Phone', 'added'],
      ['CallType', 'available'],
      ['Urgent', 'new']
    ])
  })

  it('marks nothing new before the first save', () => {
    for (const knownKeys of [null, []]) {
      const drift = diffScriptFields({ configured: [], script: active, knownKeys })
      expect(drift.available.every(field => field.state === 'available')).toBe(true)
    }
  })

  it('flags configured fields missing from the script as orphaned, case-insensitively', () => {
    const drift = diffScriptFields({
      configured: [{ fieldKey: 'FIRSTNAME', type: 'text' }, { fieldKey: 'OldField', type: 'text' }],
      script: active
    })
    expect([...drift.orphanedKeys]).toEqual(['oldfield'])
  })

  it('orphans everything when there is no active script', () => {
    const drift = diffScriptFields({ configured: [{ fieldKey: 'A', type: 'text' }, { fieldKey: 'B', type: 'text' }], script: null })
    expect([...drift.orphanedKeys]).toEqual(['a', 'b'])
    expect(drift.available).toEqual([])
  })

  it('orphans nothing when the script is incomplete', () => {
    const drift = diffScriptFields({ configured: [{ fieldKey: 'OldField', type: 'text' }], script: { ...active, complete: false } })
    expect(drift.orphanedKeys.size).toBe(0)
  })

  it('reports a type mismatch only for specific hints the saved type does not fit', () => {
    const drift = diffScriptFields({
      configured: [
        { fieldKey: 'Phone', type: 'text' },
        { fieldKey: 'Urgent', type: 'boolean' },
        { fieldKey: 'FirstName', type: 'date' },
        { fieldKey: 'CallType', type: 'number' }
      ],
      script: active
    })
    expect([...drift.typeMismatches]).toEqual([['phone', 'phone'], ['calltype', 'select']])
  })

  it('treats number and currency as compatible', () => {
    const drift = diffScriptFields({
      configured: [{ fieldKey: 'Amount', type: 'currency' }],
      script: script([scriptField('Amount', { inputType: 'number' })])
    })
    expect(drift.typeMismatches.size).toBe(0)
  })
})

describe('script hints', () => {
  it.each([
    ['phone', null, 'phone'],
    ['number', null, 'number'],
    ['multiline', null, 'longText'],
    ['date', null, 'date'],
    ['time', null, 'time'],
    ['datetime', null, 'datetime'],
    ['email', null, 'email'],
    ['checkbox', null, 'boolean'],
    ['list', [{ value: 'a', label: 'A' }], 'select'],
    ['list', null, 'text'],
    ['postalCode', null, 'text'],
    ['somethingNew', null, 'text'],
    [null, null, 'text']
  ] as const)('%s → %s', (inputType, choices, expected) => {
    expect(defaultTypeForScriptField({ inputType, choices: choices as never })).toBe(expected)
  })

  it('newFieldFromScript seeds labels, select options and the checked value', () => {
    expect(newFieldFromScript(scriptField('first_name', { label: null }), 0).label).toBe('First name')
    expect(newFieldFromScript(scriptField('CallType', { inputType: 'list', choices: [{ value: 'a', label: 'A' }] }), 1).format)
      .toEqual({ options: [{ value: 'a', label: 'A' }] })
    expect(newFieldFromScript(scriptField('Urgent', { inputType: 'checkbox', checkbox: { checkedValue: 'Yes', uncheckedValue: 'No' } }), 2).format)
      .toEqual({ trueLabel: 'Yes', falseLabel: 'No', trueValue: 'Yes' })
  })
})

describe('visibility', () => {
  it('hides inactive fields and orphaned ones unless asked', () => {
    expect(isVisibleOnMessages({ isActive: true, orphaned: false, showIfOrphaned: false })).toBe(true)
    expect(isVisibleOnMessages({ isActive: false, orphaned: false, showIfOrphaned: false })).toBe(false)
    expect(isVisibleOnMessages({ isActive: true, orphaned: true, showIfOrphaned: false })).toBe(false)
    expect(isVisibleOnMessages({ isActive: true, orphaned: true, showIfOrphaned: true })).toBe(true)
  })

  it('orders list and detail fields', () => {
    const fields = [
      { fieldKey: 'b', order: 1, showInList: true, showInDetail: false },
      { fieldKey: 'a', order: 0, showInList: true, showInDetail: true },
      { fieldKey: 'c', order: 2, showInList: false, showInDetail: true }
    ]
    expect(listFields(fields).map(f => f.fieldKey)).toEqual(['a', 'b'])
    expect(detailFields(fields).map(f => f.fieldKey)).toEqual(['a', 'c'])
  })
})

describe('sampleMessageRows', () => {
  it('is deterministic and leaves one field empty per row', () => {
    const fields = [
      { fieldKey: 'Name', type: 'text' as const, format: {} },
      { fieldKey: 'Phone', type: 'phone' as const, format: { style: 'national' as const } },
      { fieldKey: 'Kind', type: 'select' as const, format: { options: [{ value: 'a', label: 'A' }] } }
    ]
    const rows = sampleMessageRows(fields)
    expect(rows).toEqual(sampleMessageRows(fields))
    expect(rows).toHaveLength(3)
    rows.forEach((row) => {
      expect(Object.values(row.fields).filter(value => value === null)).toHaveLength(1)
    })
    expect(rows.some(row => row.fields.Kind === 'a')).toBe(true)
  })
})

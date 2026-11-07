import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MESSAGE_FIELD_FORMATS,
  isRetrievableFieldKey,
  messageFieldConfigInputSchema,
  messageFieldSchema
} from '../../shared/utils/messageFields'
import { MESSAGE_FIELD_TYPES } from '../../shared/utils/messageFieldTypes'
import type { MessageFieldType } from '../../shared/utils/messageFieldTypes'

function field(overrides: Record<string, unknown> = {}) {
  return {
    fieldKey: 'Phone',
    label: 'Phone',
    type: 'phone',
    format: { style: 'national' },
    order: 0,
    showInList: true,
    showInDetail: true,
    isActive: true,
    showIfOrphaned: false,
    ...overrides
  }
}

function config(fields: unknown[], overrides: Record<string, unknown> = {}) {
  return { revision: 0, scriptAccountNumber: '1042', fields, ...overrides }
}

function issues(result: { success: boolean, error?: { issues: { message: string, path: PropertyKey[] }[] } }) {
  return result.success ? [] : result.error!.issues
}

describe('messageFieldSchema', () => {
  it('accepts every type with its default format', () => {
    for (const type of MESSAGE_FIELD_TYPES) {
      const format = type === 'select' ? { options: [{ value: 'a', label: 'A' }] } : DEFAULT_MESSAGE_FIELD_FORMATS[type]
      expect(messageFieldSchema.safeParse(field({ type, format })).success, type).toBe(true)
    }
  })

  it('rejects a type outside the allowed list', () => {
    expect(messageFieldSchema.safeParse(field({ type: 'money', format: {} })).success).toBe(false)
  })

  it('rejects a format that belongs to another type', () => {
    expect(messageFieldSchema.safeParse(field({ type: 'number', format: { style: 'national' } })).success).toBe(false)
    expect(messageFieldSchema.safeParse(field({ type: 'text', format: { decimals: 2 } })).success).toBe(false)
  })

  it.each<[MessageFieldType, unknown]>([
    ['number', { decimals: 7, thousands: true }],
    ['number', { decimals: 1.5, thousands: true }],
    ['currency', { currency: 'usd', decimals: 2 }],
    ['currency', { currency: 'USD', decimals: 5 }],
    ['longText', { listMaxChars: 5 }],
    ['date', { style: 'full' }],
    ['time', { hourCycle: '13h' }],
    ['datetime', { dateStyle: 'medium', hourCycle: '12h' }],
    ['phone', { style: 'e164' }],
    ['boolean', { trueLabel: '', falseLabel: 'No' }],
    ['select', { options: [] }],
    ['select', { options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'Again' }] }],
    ['select', { options: [{ value: 'a', label: ' ' }] }]
  ])('rejects an invalid %s format %j', (type, format) => {
    expect(messageFieldSchema.safeParse(field({ type, format })).success).toBe(false)
  })

  it('rejects empty labels and keys, and control characters in keys', () => {
    expect(messageFieldSchema.safeParse(field({ label: '  ' })).success).toBe(false)
    expect(messageFieldSchema.safeParse(field({ fieldKey: '' })).success).toBe(false)
    expect(messageFieldSchema.safeParse(field({ fieldKey: 'a\u0000b' })).success).toBe(false)
  })
})

describe('messageFieldConfigInputSchema', () => {
  it('accepts a config ordered 0..n-1', () => {
    const result = messageFieldConfigInputSchema.safeParse(config([
      field({ fieldKey: 'Phone', order: 1 }),
      field({ fieldKey: 'FirstName', type: 'text', format: {}, order: 0 })
    ]))
    expect(result.success).toBe(true)
  })

  it('accepts an empty config and a null account', () => {
    expect(messageFieldConfigInputSchema.safeParse(config([], { scriptAccountNumber: null })).success).toBe(true)
  })

  it('rejects duplicate keys, case-insensitively, at the duplicate', () => {
    const result = messageFieldConfigInputSchema.safeParse(config([
      field({ fieldKey: 'Phone', order: 0 }),
      field({ fieldKey: ' phone ', order: 1 })
    ]))
    const found = issues(result)
    expect(found).toHaveLength(1)
    expect(found[0]!.path).toEqual(['fields', 1, 'fieldKey'])
  })

  it('rejects gaps in order', () => {
    const result = messageFieldConfigInputSchema.safeParse(config([
      field({ fieldKey: 'A', order: 0 }),
      field({ fieldKey: 'B', order: 2 })
    ]))
    expect(issues(result).map(issue => issue.message)).toContain('Field order must run 0, 1, 2… with no gaps or repeats')
  })

  it('rejects repeated order', () => {
    const result = messageFieldConfigInputSchema.safeParse(config([
      field({ fieldKey: 'A', order: 0 }),
      field({ fieldKey: 'B', order: 0 })
    ]))
    expect(result.success).toBe(false)
  })

  it('rejects orders that do not start at 0', () => {
    expect(messageFieldConfigInputSchema.safeParse(config([field({ order: 1 })])).success).toBe(false)
  })

  it('rejects a malformed account number and a negative revision', () => {
    expect(messageFieldConfigInputSchema.safeParse(config([], { scriptAccountNumber: '12a' })).success).toBe(false)
    expect(messageFieldConfigInputSchema.safeParse(config([], { revision: -1 })).success).toBe(false)
  })

  it('normalises the account number like the rest of Insight', () => {
    const result = messageFieldConfigInputSchema.parse(config([], { scriptAccountNumber: '0042' }))
    expect(result.scriptAccountNumber).toBe('42')
  })

  it('rejects more than 200 fields', () => {
    const fields = Array.from({ length: 201 }, (_, i) => field({ fieldKey: `F${i}`, order: i }))
    expect(messageFieldConfigInputSchema.safeParse(config(fields)).success).toBe(false)
  })

  it('accepts 50 active fields, with any number inactive', () => {
    const fields = Array.from({ length: 80 }, (_, i) => field({ fieldKey: `F${i}`, order: i, isActive: i < 50 }))
    expect(messageFieldConfigInputSchema.safeParse(config(fields)).success).toBe(true)
  })

  it('rejects more than 50 active fields, since au-api returns at most 50', () => {
    const fields = Array.from({ length: 51 }, (_, i) => field({ fieldKey: `F${i}`, order: i }))
    const result = messageFieldConfigInputSchema.safeParse(config(fields))
    expect(issues(result).map(issue => issue.message)).toContain('Messages can show at most 50 fields; turn some off')
  })
})

describe('isRetrievableFieldKey', () => {
  it('accepts the names au-api /v1/messages accepts', () => {
    for (const key of ['Phone', 'caller_name', '_x', 'A.b-c', 'x'.repeat(64)]) {
      expect(isRetrievableFieldKey(key), key).toBe(true)
    }
  })

  it('rejects names au-api would refuse', () => {
    for (const key of ['', '1st', '__internal', 'Caller Name', 'a,b', 'é', 'x'.repeat(65)]) {
      expect(isRetrievableFieldKey(key), key).toBe(false)
    }
  })
})

describe('received setting in a save', () => {
  const listField = { fieldKey: 'Name', label: 'Name', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true, isActive: true, showIfOrphaned: false }
  const detailField = { ...listField, showInList: false }
  const save = (fields: unknown[], received?: unknown) => messageFieldConfigInputSchema.safeParse({ revision: 0, scriptAccountNumber: '626', fields, ...(received ? { received } : {}) })

  it('defaults to shown in the list and the message', () => {
    const result = save([listField])
    expect(result.success && result.data.received).toEqual({ showInList: true, showInDetail: true })
  })

  it('can be hidden everywhere while a field is a list column', () => {
    expect(save([listField], { showInList: false, showInDetail: false }).success).toBe(true)
  })

  it('needs Received or a field as a list column', () => {
    const result = save([detailField], { showInList: false, showInDetail: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map(issue => issue.message)).toContain('Show Received or at least one field as a list column')
    expect(save([detailField], { showInList: true, showInDetail: false }).success).toBe(true)
    expect(save([], { showInList: false, showInDetail: false }).success).toBe(true)
  })
})

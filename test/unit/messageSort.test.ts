import { describe, expect, it } from 'vitest'
import { isDefaultMessageSort, messageSortDefault, resolveMessageSort, sortMessageRows } from '../../shared/utils/messageFields'
import type { MessageColumnField, MessageRow } from '../../shared/utils/messageFields'

/**
 * Sorting the messages list (sortMessageRows): every column, read by its
 * field type the way the formatter reads it, empty values last, ties newest
 * first. Synthetic messages only.
 */

function field(fieldKey: string, type: MessageColumnField['type'], format: MessageColumnField['format'] = {}): MessageColumnField {
  return { fieldKey, label: fieldKey, type, format, order: 0, showInList: true, showInDetail: true }
}

const fields: MessageColumnField[] = [
  field('Name', 'text'),
  field('Amount', 'currency', { currency: 'USD', decimals: 2 }),
  field('Day', 'date', { style: 'medium' }),
  field('CallTime', 'datetime', { dateStyle: 'medium', hourCycle: '12h', showZone: true }),
  field('Arrive', 'time', { hourCycle: '12h' }),
  field('Urgent', 'boolean', { trueLabel: 'Yes', falseLabel: 'No' }),
  field('Dept', 'select', { options: [{ value: 'B', label: 'Accounting' }, { value: 'A', label: 'Shipping' }] })
]

let id = 0
function row(values: Record<string, string | number | boolean | null>, createdAt = '2026-11-06T12:00:00.000Z'): MessageRow {
  return { id: `m${++id}`, createdAt, accountNumber: '626', fields: values }
}

const order = (rows: MessageRow[], key: string) => rows.map(r => r.fields[key] ?? '∅')

describe('sortMessageRows', () => {
  it('sorts text naturally, ignoring case: Unit 9 before Unit 10', () => {
    const rows = [row({ Name: 'unit 10' }), row({ Name: 'Unit 9' }), row({ Name: 'apple' })]
    expect(order(sortMessageRows(rows, fields, { fieldKey: 'Name', direction: 'asc' }), 'Name')).toEqual(['apple', 'Unit 9', 'unit 10'])
  })

  it('sorts amounts by value, not as text', () => {
    const rows = [row({ Amount: '$1,200.00' }), row({ Amount: '95' }), row({ Amount: 300 })]
    expect(order(sortMessageRows(rows, fields, { fieldKey: 'Amount', direction: 'desc' }), 'Amount')).toEqual(['$1,200.00', 300, '95'])
  })

  it('sorts dates and date-times by when they are, in any format the formatter reads', () => {
    const days = [row({ Day: '11/6/2026' }), row({ Day: '2026-10-28' }), row({ Day: '1/2/2027' })]
    expect(order(sortMessageRows(days, fields, { fieldKey: 'Day', direction: 'asc' }), 'Day')).toEqual(['2026-10-28', '11/6/2026', '1/2/2027'])
    const times = [row({ CallTime: '11/6/2026 9:34:28 PM' }), row({ CallTime: '11/6/2026 10:02:28 AM' }), row({ CallTime: '11/5/2026 11:59:00 PM' })]
    expect(order(sortMessageRows(times, fields, { fieldKey: 'CallTime', direction: 'desc' }), 'CallTime'))
      .toEqual(['11/6/2026 9:34:28 PM', '11/6/2026 10:02:28 AM', '11/5/2026 11:59:00 PM'])
  })

  it('sorts times of day by the clock, 12- or 24-hour', () => {
    const rows = [row({ Arrive: '2:30 PM' }), row({ Arrive: '09:15' }), row({ Arrive: '12:05 AM' })]
    expect(order(sortMessageRows(rows, fields, { fieldKey: 'Arrive', direction: 'asc' }), 'Arrive')).toEqual(['12:05 AM', '09:15', '2:30 PM'])
  })

  it('sorts yes/no and choices by the label shown', () => {
    const flags = [row({ Urgent: 'Y' }), row({ Urgent: false }), row({ Urgent: 'yes' })]
    const sorted = order(sortMessageRows(flags, fields, { fieldKey: 'Urgent', direction: 'asc' }), 'Urgent')
    // "No" before "Yes"; the two yeses tie
    expect(sorted[0]).toBe(false)
    expect(sorted.slice(1).sort()).toEqual(['Y', 'yes'])
    const depts = [row({ Dept: 'A' }), row({ Dept: 'B' })]
    expect(order(sortMessageRows(depts, fields, { fieldKey: 'Dept', direction: 'asc' }), 'Dept')).toEqual(['B', 'A'])
  })

  it('puts empty values last in both directions, and values that don\'t parse after ones that do', () => {
    const rows = [row({ Amount: null }), row({ Amount: 'call back' }), row({ Amount: '5' }), row({ Amount: '' }), row({ Amount: '40' })]
    const asc = order(sortMessageRows(rows, fields, { fieldKey: 'Amount', direction: 'asc' }), 'Amount')
    expect(asc.slice(0, 3)).toEqual(['5', '40', 'call back'])
    expect(asc.slice(3).sort()).toEqual(['', '∅'])
    const desc = order(sortMessageRows(rows, fields, { fieldKey: 'Amount', direction: 'desc' }), 'Amount')
    expect(desc.slice(0, 3)).toEqual(['call back', '40', '5'])
    expect(desc.slice(3).sort()).toEqual(['', '∅'])
  })

  it('breaks ties newest first, and sorts by Received in either direction', () => {
    const older = row({ Name: 'Same' }, '2026-11-05T12:00:00.000Z')
    const newer = row({ Name: 'Same' }, '2026-11-06T12:00:00.000Z')
    expect(sortMessageRows([older, newer], fields, { fieldKey: 'Name', direction: 'asc' })).toEqual([newer, older])
    expect(sortMessageRows([newer, older], fields, { fieldKey: null, direction: 'asc' })).toEqual([older, newer])
    expect(sortMessageRows([older, newer], fields, { fieldKey: null, direction: 'desc' })).toEqual([newer, older])
  })

  it('breaks exact ties by message id as a number', () => {
    const a = { id: '9', createdAt: '2026-11-06T12:00:00.000Z', accountNumber: '626', fields: {} }
    const b = { id: '10', createdAt: '2026-11-06T12:00:00.000Z', accountNumber: '626', fields: {} }
    expect(sortMessageRows([a, b], fields, { fieldKey: null, direction: 'desc' }).map(r => r.id)).toEqual(['10', '9'])
  })

  it('doesn\'t change the rows it was given', () => {
    const rows = [row({ Name: 'b' }), row({ Name: 'a' })]
    const copy = [...rows]
    sortMessageRows(rows, fields, { fieldKey: 'Name', direction: 'asc' })
    expect(rows).toEqual(copy)
  })
})

describe('resolveMessageSort', () => {
  it('defaults to newest first', () => {
    expect(resolveMessageSort(fields)).toEqual({ fieldKey: null, direction: 'desc' })
    expect(isDefaultMessageSort(resolveMessageSort(fields))).toBe(true)
  })

  it('gives each type its first-click direction', () => {
    expect(resolveMessageSort(fields, 'amount')).toEqual({ fieldKey: 'Amount', direction: 'desc' })
    expect(resolveMessageSort(fields, 'Name')).toEqual({ fieldKey: 'Name', direction: 'asc' })
    expect(resolveMessageSort(fields, 'Name', 'desc')).toEqual({ fieldKey: 'Name', direction: 'desc' })
    expect(resolveMessageSort(fields, null, 'asc')).toEqual({ fieldKey: null, direction: 'asc' })
    expect(messageSortDefault('time')).toBe('asc')
  })

  it('ignores a field that isn\'t shown, direction included', () => {
    expect(resolveMessageSort(fields, 'Covid19Travel', 'asc')).toEqual({ fieldKey: null, direction: 'desc' })
  })
})

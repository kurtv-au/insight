import { describe, expect, it } from 'vitest'
import { exportDate, exportDateTime, exportFields, messagesToCsvRows } from '../../server/utils/messageExport'
import type { MessageColumnField, MessageRow } from '../../shared/utils/messageFields'

/**
 * The rows of a messages CSV export (server/utils/messageExport.ts): header,
 * received time in the viewer's zone, account number, then every field the
 * messages page shows, formatted in full. Synthetic messages only.
 */

function field(fieldKey: string, label: string, order: number, overrides: Partial<MessageColumnField> = {}): MessageColumnField {
  return { fieldKey, label, type: 'text', format: {}, order, showInList: true, showInDetail: true, ...overrides }
}

const fields: MessageColumnField[] = [
  field('Message', 'Message', 3, { type: 'longText', format: { listMaxChars: 20 }, showInList: false }),
  field('CallTime', 'Call Time', 0, { showInDetail: false }),
  field('Hidden', 'Neither', 1, { showInList: false, showInDetail: false }),
  field('Amount', 'Amount', 2, { type: 'currency', format: { currency: 'USD', decimals: 2 } }),
  field('Urgent', 'Urgent?', 4, { type: 'boolean', format: { trueLabel: 'Yes', falseLabel: 'No' } })
]

function message(overrides: Partial<MessageRow> = {}): MessageRow {
  return { id: 'm1', createdAt: '2026-10-28T17:30:00.000Z', accountNumber: '626', fields: {}, ...overrides }
}

describe('exportFields', () => {
  it('keeps list and detail fields, in order, and leaves out fields shown nowhere', () => {
    expect(exportFields(fields).map(f => f.fieldKey)).toEqual(['CallTime', 'Amount', 'Message', 'Urgent'])
  })
})

describe('exportDateTime', () => {
  it('writes the moment in the zone as YYYY-MM-DD HH:mm, 24-hour', () => {
    const date = new Date('2026-10-28T17:30:00Z')
    expect(exportDateTime(date, 'America/New_York')).toBe('2026-10-28 13:30')
    expect(exportDateTime(date, 'America/Chicago')).toBe('2026-10-28 12:30')
    expect(exportDateTime(new Date('2026-10-29T03:05:00Z'), 'America/Los_Angeles')).toBe('2026-10-28 20:05')
    expect(exportDateTime(new Date('2026-10-28T04:15:00Z'), 'America/New_York')).toBe('2026-10-28 00:15')
  })

  it('follows DST', () => {
    // US clocks go back on Nov 1, 2026: 13:00 UTC is 08:00 EST after, 09:00 EDT before
    expect(exportDateTime(new Date('2026-10-31T13:00:00Z'), 'America/New_York')).toBe('2026-10-31 09:00')
    expect(exportDateTime(new Date('2026-11-02T13:00:00Z'), 'America/New_York')).toBe('2026-11-02 08:00')
  })

  it('gives the calendar day for file names', () => {
    expect(exportDate(new Date('2026-10-29T03:05:00Z'), 'America/Los_Angeles')).toBe('2026-10-28')
  })
})

describe('messagesToCsvRows', () => {
  it('writes a header and one row per message, formatted in full', () => {
    const long = 'Called in sick with the flu, expects to be back on Monday morning.'
    const rows = messagesToCsvRows([
      message({ fields: { CallTime: '1:30 PM', Hidden: 'never', Amount: 12.5, Message: long, Urgent: true } }),
      message({ id: 'm2', createdAt: null, accountNumber: null, fields: { CallTime: '', Amount: null } })
    ], fields, 'America/New_York')
    expect(rows).toEqual([
      ['Received (US/Eastern)', 'Account #', 'Call Time', 'Amount', 'Message', 'Urgent?'],
      ['2026-10-28 13:30', '626', '1:30 PM', '$12.50', long, 'Yes'],
      ['', '', '', '', '', '']
    ])
  })

  it('writes only the header when there are no messages', () => {
    expect(messagesToCsvRows([], fields, 'America/Chicago')).toEqual([['Received (US/Central)', 'Account #', 'Call Time', 'Amount', 'Message', 'Urgent?']])
  })
})

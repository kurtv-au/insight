import { describe, expect, it } from 'vitest'
import { DEFAULT_MESSAGE_FIELD_FORMATS, formatFieldValue } from '../../shared/utils/messageFields'
import { MESSAGE_FIELD_TYPES } from '../../shared/utils/messageFieldTypes'

const NY = { timeZone: 'America/New_York' }

describe('formatFieldValue: empty and hostile input', () => {
  it.each(MESSAGE_FIELD_TYPES)('%s: null, undefined and blank strings are an em dash', (type) => {
    for (const value of [null, undefined, '', '   ']) {
      expect(formatFieldValue(value, type, null)).toBe('—')
    }
  })

  it.each(MESSAGE_FIELD_TYPES)('%s: never throws on odd input', (type) => {
    for (const value of [{}, [], Symbol.iterator.toString(), Number.NaN, Infinity, new Date('nope'), true, 0]) {
      expect(() => formatFieldValue(value, type, DEFAULT_MESSAGE_FIELD_FORMATS[type], { timeZone: 'Not/AZone' })).not.toThrow()
    }
  })

  it('falls back to the default format when the stored one is missing', () => {
    expect(formatFieldValue(1234, 'number', null)).toBe('1,234')
  })
})

describe('formatFieldValue: text types', () => {
  it('text and email are trimmed as given', () => {
    expect(formatFieldValue('  Jordan  ', 'text', {})).toBe('Jordan')
    expect(formatFieldValue('a@example.com', 'email', { link: true })).toBe('a@example.com')
    expect(formatFieldValue(42, 'text', {})).toBe('42')
  })

  it('longText truncates on one line in lists only', () => {
    const text = 'Line one\nline two is quite a bit longer than the limit allows'
    expect(formatFieldValue(text, 'longText', { listMaxChars: 20 }, { context: 'list' })).toBe('Line one line two i…')
    expect(formatFieldValue(text, 'longText', { listMaxChars: 20 }, { context: 'detail' })).toBe(text)
    expect(formatFieldValue('short', 'longText', { listMaxChars: 20 }, { context: 'list' })).toBe('short')
  })
})

describe('formatFieldValue: numbers', () => {
  it('number: decimals and grouping', () => {
    expect(formatFieldValue(1234.567, 'number', { decimals: 2, thousands: true })).toBe('1,234.57')
    expect(formatFieldValue('1,234', 'number', { decimals: 0, thousands: false })).toBe('1234')
    expect(formatFieldValue('-3.5', 'number', { decimals: 1, thousands: true })).toBe('-3.5')
  })

  it('number: non-numeric input is shown as given', () => {
    expect(formatFieldValue('about 12', 'number', { decimals: 0, thousands: true })).toBe('about 12')
    expect(formatFieldValue(true, 'number', { decimals: 0, thousands: true })).toBe('true')
  })

  it('currency: code and decimals', () => {
    expect(formatFieldValue(1200, 'currency', { currency: 'USD', decimals: 2 })).toBe('$1,200.00')
    expect(formatFieldValue('$37.5', 'currency', { currency: 'USD', decimals: 2 })).toBe('$37.50')
    expect(formatFieldValue(10, 'currency', { currency: 'EUR', decimals: 0 })).toBe('€10')
  })

  it('currency: bad input and a bad currency code', () => {
    expect(formatFieldValue('n/a', 'currency', { currency: 'USD', decimals: 2 })).toBe('n/a')
    expect(formatFieldValue(5, 'currency', { currency: 'ZZZZ', decimals: 1 } as never)).toBe('5.0')
  })
})

describe('formatFieldValue: dates and times', () => {
  it('date: date-only values are never shifted by the timezone', () => {
    expect(formatFieldValue('2026-10-28', 'date', { style: 'medium' }, { timeZone: 'Pacific/Honolulu' })).toBe('Oct 28, 2026')
    expect(formatFieldValue('10/28/2026', 'date', { style: 'short' }, NY)).toBe('10/28/2026')
    expect(formatFieldValue('2026-10-28', 'date', { style: 'long' })).toBe('October 28, 2026')
  })

  it('date: instants use the timezone', () => {
    expect(formatFieldValue('2026-10-28T02:00:00Z', 'date', { style: 'medium' }, NY)).toBe('Oct 27, 2026')
    expect(formatFieldValue('2026-10-28T02:00:00Z', 'date', { style: 'medium' }, { timeZone: 'UTC' })).toBe('Oct 28, 2026')
  })

  it('date: bad input is shown as given', () => {
    expect(formatFieldValue('2026-02-30', 'date', { style: 'medium' })).toBe('2026-02-30')
    expect(formatFieldValue('next Tuesday', 'date', { style: 'medium' })).toBe('next Tuesday')
  })

  it('time: wall-clock times in 12h and 24h', () => {
    expect(formatFieldValue('14:30', 'time', { hourCycle: '12h' })).toBe('2:30 PM')
    expect(formatFieldValue('2:05 pm', 'time', { hourCycle: '24h' })).toBe('14:05')
    expect(formatFieldValue('2026-10-28 09:15', 'time', { hourCycle: '12h' }, NY)).toBe('9:15 AM')
  })

  it('time: instants use the timezone; bad input is shown as given', () => {
    expect(formatFieldValue('2026-10-28T18:30:00Z', 'time', { hourCycle: '12h' }, NY)).toBe('2:30 PM')
    expect(formatFieldValue('25:00', 'time', { hourCycle: '12h' })).toBe('25:00')
    expect(formatFieldValue('13:00 PM', 'time', { hourCycle: '12h' })).toBe('13:00 PM')
  })

  it('datetime: instants in the timezone, with and without the zone', () => {
    expect(formatFieldValue('2026-10-28T18:30:00Z', 'datetime', { dateStyle: 'medium', hourCycle: '12h', showZone: true }, NY))
      .toBe('Oct 28, 2026, 2:30 PM EDT')
    expect(formatFieldValue(new Date('2026-12-28T18:30:00Z'), 'datetime', { dateStyle: 'short', hourCycle: '24h', showZone: false }, NY))
      .toBe('12/28/2026, 13:30')
  })

  it('datetime: naive values are wall-clock, with no zone name', () => {
    expect(formatFieldValue('2026-10-28 14:30', 'datetime', { dateStyle: 'medium', hourCycle: '12h', showZone: true }, NY))
      .toBe('Oct 28, 2026, 2:30 PM')
    expect(formatFieldValue('10/28/2026 2:30 PM', 'datetime', { dateStyle: 'medium', hourCycle: '24h', showZone: true }, NY))
      .toBe('Oct 28, 2026, 14:30')
  })

  it('datetime: bad input is shown as given; a bad timezone falls back', () => {
    expect(formatFieldValue('soon', 'datetime', DEFAULT_MESSAGE_FIELD_FORMATS.datetime, NY)).toBe('soon')
    expect(formatFieldValue('2026-10-28T18:30:00Z', 'datetime', { dateStyle: 'medium', hourCycle: '24h', showZone: false }, { timeZone: 'Not/AZone' }))
      .toBe('Oct 28, 2026, 18:30')
  })
})

describe('formatFieldValue: phone, boolean, select', () => {
  it('phone: national formatting or raw', () => {
    expect(formatFieldValue('2695550134', 'phone', { style: 'national' })).toBe('(269) 555-0134')
    expect(formatFieldValue('+1 269 555 0134', 'phone', { style: 'national' })).toBe('(269) 555-0134')
    expect(formatFieldValue('2695550134', 'phone', { style: 'raw' })).toBe('2695550134')
    expect(formatFieldValue('ext 12', 'phone', { style: 'national' })).toBe('ext 12')
  })

  it('boolean: booleans, common tokens and the script\'s checked value', () => {
    const format = { trueLabel: 'Yes', falseLabel: 'No', trueValue: 'Urgent' }
    expect(formatFieldValue(true, 'boolean', format)).toBe('Yes')
    expect(formatFieldValue(false, 'boolean', format)).toBe('No')
    expect(formatFieldValue('True', 'boolean', format)).toBe('Yes')
    expect(formatFieldValue('urgent', 'boolean', format)).toBe('Yes')
    expect(formatFieldValue('0', 'boolean', format)).toBe('No')
    expect(formatFieldValue('maybe', 'boolean', format)).toBe('maybe')
  })

  it('select: value to label, loosely; unknown values as given', () => {
    const format = { options: [{ value: 'ASAP', label: 'Call back now' }, { value: 'Routine', label: 'Office hours' }] }
    expect(formatFieldValue('ASAP', 'select', format)).toBe('Call back now')
    expect(formatFieldValue(' routine ', 'select', format)).toBe('Office hours')
    expect(formatFieldValue('Other', 'select', format)).toBe('Other')
  })
})

import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '../../shared/utils/csv'

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Reason for Absence')).toBe('Reason for Absence')
    expect(csvCell('')).toBe('')
    expect(csvCell('2026-10-28 13:30')).toBe('2026-10-28 13:30')
  })

  it('quotes commas, quotes and line breaks, doubling quotes', () => {
    expect(csvCell('Smith, Jo')).toBe('"Smith, Jo"')
    expect(csvCell('said "hi"')).toBe('"said ""hi"""')
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"')
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it.each([
    ['=SUM(A1:A9)', '\'=SUM(A1:A9)'],
    ['+1 (555) 123-4567', '\'+1 (555) 123-4567'],
    ['-2', '\'-2'],
    ['@cmd', '\'@cmd'],
    ['\tTabbed', '\'\tTabbed']
  ])('keeps %j from running as a formula', (value, safe) => {
    expect(csvCell(value)).toBe(safe)
  })

  it('guards and quotes together', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('leaves a formula character that isn\'t first', () => {
    expect(csvCell('Call back at 3-4pm')).toBe('Call back at 3-4pm')
    expect(csvCell('a=b')).toBe('a=b')
  })
})

describe('toCsv', () => {
  it('starts with a BOM and ends every row with CRLF', () => {
    expect(toCsv([['Name', 'Note'], ['Jo', 'Smith, Jo'], ['Ana', 'Café']])).toBe('﻿Name,Note\r\nJo,"Smith, Jo"\r\nAna,Café\r\n')
  })

  it('writes a header-only file', () => {
    expect(toCsv([['Received', 'Account #']])).toBe('﻿Received,Account #\r\n')
  })
})

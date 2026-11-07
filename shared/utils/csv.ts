/**
 * CSV for spreadsheet downloads (RFC 4180): fields with a comma, quote or line
 * break are quoted, quotes doubled, rows end in CRLF, and the file starts with
 * a UTF-8 byte order mark so Excel reads accented text correctly.
 */

const BOM = '﻿'

/**
 * Text that a spreadsheet would run as a formula (=, +, -, @, or a leading tab
 * or carriage return) gets a leading apostrophe, so caller-supplied message
 * text can't execute when the file is opened ("CSV injection").
 */
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(rows: readonly (readonly string[])[]) {
  return BOM + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

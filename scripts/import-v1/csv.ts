/**
 * Minimal RFC 4180 CSV parser for the v1 export: quoted fields, doubled quotes,
 * and commas or line breaks inside quotes. The first row is the header; each
 * later row becomes an object keyed by it. A UTF-8 BOM is ignored.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0

  for (; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++
      }
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (quoted) {
    throw new Error('Unterminated quoted field')
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }

  const [header, ...body] = rows.filter(r => r.length > 1 || r[0] !== '')
  if (!header) {
    return []
  }
  return body.map((values, index) => {
    if (values.length !== header.length) {
      throw new Error(`Row ${index + 2} has ${values.length} fields, expected ${header.length}`)
    }
    return Object.fromEntries(header.map((key, k) => [key, values[k]!]))
  })
}

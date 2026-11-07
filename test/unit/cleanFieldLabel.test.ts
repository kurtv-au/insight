import { describe, expect, it } from 'vitest'
import { cleanFieldLabel, cleanScriptLabels, messageFieldSchema } from '../../shared/utils/messageFields'
import type { ActiveScriptDto } from '../../shared/utils/messageFields'

/**
 * Call-center scripts mark their field labels for operators (↟, ⇄, a standalone
 * Ø, superscript digits). Those markers are stripped wherever a label enters
 * insight. Examples are real labels from live scripts.
 */
describe('cleanFieldLabel', () => {
  it.each([
    ['Reason for Absence ↟', 'Reason for Absence'],
    ['Date Ø', 'Date'],
    ['Call # Ø', 'Call #'],
    ['First Name¹', 'First Name'],
    ['City²', 'City'],
    ['Property⁴', 'Property'],
    ['Employee Name ⇄', 'Employee Name'],
    ['Ans Phrase/ Emp # ⇆', 'Ans Phrase/ Emp #'],
    ['Supervisor\'s Name \t↟', 'Supervisor\'s Name'],
    ['Re: Bill? ↟', 'Re: Bill?'],
    ['Zero​width', 'Zero width']
  ])('strips markers: %j', (label, clean) => {
    expect(cleanFieldLabel(label)).toBe(clean)
  })

  it.each([
    'Badge #',
    'What Date(s)?',
    'Backup On Call (b/u)',
    'Søren',
    'Temperature (°F)',
    'Amount $',
    'Price €',
    'Total = A + B'
  ])('keeps ordinary text: %j', (label) => {
    expect(cleanFieldLabel(label)).toBe(label)
  })

  it('treats a standalone Ø as a marker wherever it is, but not inside a word', () => {
    expect(cleanFieldLabel('Ø Start Date')).toBe('Start Date')
    expect(cleanFieldLabel('Bjørn Ø')).toBe('Bjørn')
  })

  it('can leave nothing', () => {
    expect(cleanFieldLabel(' ↟ ¹ ')).toBe('')
  })
})

describe('cleanScriptLabels', () => {
  it('cleans every field label, and turns a label left empty into null', () => {
    const script: ActiveScriptDto = {
      scriptId: 1,
      name: 'S',
      versionNumber: 1,
      modifiedAt: null,
      complete: true,
      fields: [
        { key: 'Reason', label: 'Reason ↟', inputType: 'list', required: false, choices: [{ value: 'S', label: 'Sick' }], checkbox: null, sources: ['screen'], screens: [] },
        { key: 'Marker', label: '↟', inputType: null, required: false, choices: null, checkbox: null, sources: ['screen'], screens: [] },
        { key: 'NoLabel', label: null, inputType: null, required: false, choices: null, checkbox: null, sources: ['screen'], screens: [] }
      ]
    }
    expect(cleanScriptLabels(script).fields.map(f => f.label)).toEqual(['Reason', null, null])
    expect(cleanScriptLabels(script).fields[0]!.choices).toEqual([{ value: 'S', label: 'Sick' }])
  })
})

describe('saving a label', () => {
  const field = { fieldKey: 'Reason', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true, isActive: true, showIfOrphaned: false }

  it('stores it without markers', () => {
    expect(messageFieldSchema.parse({ ...field, label: '  Reason for Absence ↟ ' }).label).toBe('Reason for Absence')
  })

  it('rejects a label that is only markers', () => {
    const result = messageFieldSchema.safeParse({ ...field, label: '↟ ¹' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Every field needs a label')
  })
})

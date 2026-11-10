import { describe, expect, it } from 'vitest'
import { messageAsText, messageHeadline } from '../../shared/utils/messageFields'
import type { MessageColumnField } from '../../shared/utils/messageFields'

/** The message drawer's title when Received is hidden, and "Copy message" */

const fields: MessageColumnField[] = [
  { fieldKey: 'Notes', label: 'Notes', type: 'longText', format: {}, order: 3, showInList: false, showInDetail: true },
  { fieldKey: 'Name', label: 'Employee name', type: 'text', format: {}, order: 1, showInList: true, showInDetail: true },
  { fieldKey: 'Conf', label: 'Confirmation #', type: 'text', format: {}, order: 2, showInList: true, showInDetail: true },
  { fieldKey: 'Reason', label: 'Reason', type: 'text', format: {}, order: 0, showInList: true, showInDetail: true }
]

describe('messageHeadline', () => {
  it('takes the first two list fields, in list order, that have a value', () => {
    const message = { fields: { Reason: '  ', Name: 'Nelson; James', Conf: '562 374 60', Notes: 'x' } }
    expect(messageHeadline(message, fields, 'UTC')).toEqual({ title: 'Nelson; James', subtitle: '562 374 60' })
  })

  it('leaves out fields that aren’t list columns', () => {
    const message = { fields: { Notes: 'Only notes' } }
    expect(messageHeadline(message, fields, 'UTC')).toEqual({ title: null, subtitle: null })
  })
})

describe('messageAsText', () => {
  it('lists the detail fields with a value, in order, after the received time', () => {
    const message = { fields: { Reason: 'Family emergency', Name: 'Nelson; James', Conf: null, Notes: 'Back Monday' } }
    expect(messageAsText(message, fields, 'UTC', 'Nov 9, 2026, 8:54 PM CST')).toBe([
      'Received: Nov 9, 2026, 8:54 PM CST',
      'Reason: Family emergency',
      'Employee name: Nelson; James',
      'Notes: Back Monday'
    ].join('\n'))
  })

  it('leaves the received line out when the account hides it', () => {
    expect(messageAsText({ fields: { Name: 'A' } }, fields, 'UTC')).toBe('Employee name: A')
  })
})

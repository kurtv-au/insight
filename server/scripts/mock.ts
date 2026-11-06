import type { ActiveScriptLookup, ScriptSource } from '../utils/scripts'

// Mock active scripts for development, chosen deterministically by account
// number. Numbers ending in 0 have no active script. The rest run one of two
// versions of the same script, so switching the source account between them
// shows drift: a removed field (Company), new ones (Department, Extension) and
// a changed hint (Urgent goes from a checkbox to a list).

type Field = ActiveScriptDto['fields'][number]

function field(key: string, label: string | null, inputType: string | null, extra: Partial<Field> = {}): Field {
  return { key, label, inputType, required: false, choices: null, checkbox: null, sources: ['screen'], screens: ['Begin'], ...extra }
}

const CALL_TYPES = [
  { value: 'Call back ASAP', label: 'Immediate help (call back asap)' },
  { value: 'Call next business day', label: 'Call during office hours' },
  { value: 'Information only', label: 'Just leaving a message' }
]

const COMMON: Field[] = [
  field('FirstName', 'First Name', 'text', { required: true, sources: ['screen', 'callField'] }),
  field('LastName', 'Last Name', 'text', { sources: ['screen', 'callField'] }),
  field('Phone', 'Phone', 'phone', { required: true, sources: ['screen', 'callField'] }),
  field('Email', 'Email', 'email'),
  field('CallType', 'Call Type', 'list', { required: true, choices: CALL_TYPES }),
  field('CallbackDate', 'Callback date', 'date', { screens: ['Begin', 'SecondCall'] }),
  field('PreferredTime', 'Best time', 'time'),
  field('AmountDue', 'Amount due', 'number'),
  field('Message', 'Message', 'multiline', { sources: ['screen', 'callField'] })
]

const VERSIONS: Field[][] = [
  [
    ...COMMON,
    field('Company', 'Company', 'text', { sources: ['screen', 'callField'] }),
    field('Urgent', 'Urgent?', 'checkbox', { checkbox: { checkedValue: 'True', uncheckedValue: 'False' } }),
    field('mode_base', null, null, { sources: ['variable'], screens: [] })
  ],
  [
    ...COMMON,
    field('Department', 'Department', 'list', {
      choices: [{ value: 'Billing', label: 'Billing' }, { value: 'Service', label: 'Service' }, { value: 'Sales', label: 'Sales' }]
    }),
    field('Extension', 'Ext.', 'number'),
    field('Urgent', 'Urgent?', 'list', { choices: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] }),
    field('mode_base', null, null, { sources: ['variable'], screens: [] }),
    field('summary_name', null, null, { sources: ['variable'], screens: [] })
  ]
]

export const mockScripts: ScriptSource = {
  async activeScript(accountNumber): Promise<ActiveScriptLookup> {
    if (!/^\d{1,10}$/.test(accountNumber)) {
      return { status: 'unknown_account' }
    }
    if (accountNumber.endsWith('0')) {
      return { status: 'no_script' }
    }
    const version = Number(accountNumber.at(-1)) % 2
    return {
      status: 'ok',
      script: {
        scriptId: 6000 + Number(accountNumber.slice(-3)),
        name: `Main (mock ${accountNumber})`,
        versionNumber: 40 + version,
        modifiedAt: version ? '2026-10-29T19:04:46.000Z' : '2026-09-11T15:20:00.000Z',
        complete: true,
        fields: VERSIONS[version]!
      }
    }
  }
}

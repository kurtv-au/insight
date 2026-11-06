import type { ActiveScriptLookup, ScriptSource } from '../utils/scripts'

// The active script's field list from au-api's customer API (/v1/scripts/active).
// au-api parses the script and publishes only its fields; insight never sees
// the script itself.

interface ApiScriptField {
  key: string
  label: string | null
  inputType: string | null
  required: boolean
  choices: { value: string, label: string }[] | null
  checkbox: { checkedValue: string, uncheckedValue: string } | null
  sources: ('screen' | 'callField' | 'variable')[]
  screens: string[]
}

export interface ApiActiveScript {
  scriptId: number
  name: string
  versionNumber: number
  modifiedAt: string | null
  complete: boolean
  fields: ApiScriptField[]
}

/** Explicit projection, so nothing au-api adds later reaches the browser unreviewed */
export function toActiveScriptDto(script: ApiActiveScript): ActiveScriptDto {
  return {
    scriptId: script.scriptId,
    name: script.name,
    versionNumber: script.versionNumber,
    modifiedAt: script.modifiedAt,
    complete: script.complete,
    fields: script.fields.slice(0, 1000).map(field => ({
      key: field.key,
      label: field.label,
      inputType: field.inputType,
      required: field.required,
      choices: field.choices?.map(choice => ({ value: choice.value, label: choice.label })) ?? null,
      checkbox: field.checkbox ? { checkedValue: field.checkbox.checkedValue, uncheckedValue: field.checkbox.uncheckedValue } : null,
      sources: field.sources,
      screens: field.screens
    }))
  }
}

export const auApiScripts: ScriptSource = {
  async activeScript(accountNumber): Promise<ActiveScriptLookup> {
    if (!/^\d{1,10}$/.test(accountNumber)) {
      return { status: 'unknown_account' }
    }
    const result = await auApiGet<{ data: { clientNumber: number, script: ApiActiveScript | null } }>(
      '/v1/scripts/active',
      { clientNumber: accountNumber },
      { tag: 'scripts', unavailableMessage: SCRIPTS_UNAVAILABLE }
    )
    if (!result) {
      return { status: 'unknown_account' }
    }
    return result.data.script ? { status: 'ok', script: toActiveScriptDto(result.data.script) } : { status: 'no_script' }
  }
}

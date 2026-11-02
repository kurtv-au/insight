import { auApiScripts } from '../scripts/au-api'
import { mockScripts } from '../scripts/mock'

/**
 * What looking up an account's active script can find: the script; `no_script`
 * when the account runs none; `unknown_account` when au-api has no client
 * record for the number or it isn't on insight's key.
 */
export type ActiveScriptLookup = { status: 'ok', script: ActiveScriptDto } | { status: 'no_script' } | { status: 'unknown_account' }

export interface ScriptSource {
  activeScript(accountNumber: string): Promise<ActiveScriptLookup>
}

export const SCRIPTS_UNAVAILABLE = 'Couldn’t reach Answer United’s script service. Your changes are still here; try again in a moment.'

// au-api when a key is configured. Without one, development uses mock scripts,
// and production fails rather than offer made-up fields.
function scriptSource(): ScriptSource {
  if (useRuntimeConfig().auApi.key) {
    return auApiScripts
  }
  if (import.meta.dev) {
    return mockScripts
  }
  throw createError({ statusCode: 503, message: SCRIPTS_UNAVAILABLE })
}

export function getActiveScript(accountNumber: string): Promise<ActiveScriptLookup> {
  return scriptSource().activeScript(accountNumber)
}

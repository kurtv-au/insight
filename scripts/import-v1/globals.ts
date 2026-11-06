/**
 * shared/utils/schemas.ts reads Nuxt auto-imports (ROLES, TIMEZONE_IDS…) as
 * globals when it loads. Plain Node has no auto-imports, so recreate them, as
 * test/setup.ts does for Vitest. Import this before anything that loads
 * schemas.ts.
 */
import * as messageFieldTypes from '../../shared/utils/messageFieldTypes.ts'
import * as recordings from '../../shared/utils/recordings.ts'
import * as roles from '../../shared/utils/roles.ts'
import * as support from '../../shared/utils/support.ts'
import * as tenants from '../../shared/utils/tenants.ts'
import * as timezones from '../../shared/utils/timezones.ts'

Object.assign(globalThis, roles, tenants, timezones, recordings, support, messageFieldTypes)

/**
 * Nuxt auto-imports everything in shared/utils on both sides. Unit tests run in
 * plain Node, so recreate that here: modules with no auto-imported
 * dependencies first, then the ones that use them at load time (schemas.ts
 * reads ROLES, TIMEZONE_IDS… as globals).
 */
const independent = await Promise.all([
  import('../shared/utils/roles'),
  import('../shared/utils/tenants'),
  import('../shared/utils/timezones'),
  import('../shared/utils/recordings'),
  import('../shared/utils/support'),
  import('../shared/utils/messageFieldTypes'),
  import('../shared/utils/csv')
])
for (const mod of independent) {
  Object.assign(globalThis, mod)
}
Object.assign(globalThis, await import('../shared/utils/schemas'))
Object.assign(globalThis, await import('../shared/utils/messageFields'))
Object.assign(globalThis, await import('../shared/utils/messageFilters'))

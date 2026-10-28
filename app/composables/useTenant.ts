export interface TenantContext {
  tenant: {
    id: string
    slug: string
    name: string
    status: TenantStatus
    timezone: string
  }
  role: Role
}

/**
 * The tenant for the current `/t/[tenant]` route and the user's role in it.
 * Loaded by `pages/t/[tenant].vue`. `can()` is for showing or hiding UI only;
 * the server enforces every permission.
 */
export function useTenant() {
  const context = useState<TenantContext | null>('tenant-context', () => null)

  return {
    context,
    tenant: computed(() => context.value?.tenant ?? null),
    role: computed(() => context.value?.role ?? null),
    can: (minRole: Role) => hasRole(context.value?.role, minRole)
  }
}

export function useMyTenants() {
  return useFetch('/api/me/tenants', { key: 'my-tenants', default: () => [] })
}

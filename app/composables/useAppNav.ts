export interface AppNavItem {
  icon: string
  label: string
  to: string
  /** Active only on this exact path, not on paths below it */
  exact?: boolean
  /** Not in the account's plan: still shown, with a lock, and the page explains */
  locked?: boolean
}

/** Navigation shared by the desktop rail and the mobile tab bar */
export function useAppNav() {
  const route = useRoute()
  const { user } = useUserSession()
  const { tenant, role } = useTenant()
  const { data: myTenants } = useMyTenants()

  // Outside an account (Account, Support…), someone with just one keeps its
  // tabs, so getting back to their messages is one tap
  const navTenant = computed(() => {
    if (tenant.value) {
      return { slug: tenant.value.slug, role: role.value, plan: tenant.value.plan }
    }
    const only = myTenants.value.length === 1 ? myTenants.value[0]! : null
    return only && canOpenTenant(only.status, user.value?.isPlatformAdmin) ? { slug: only.slug, role: only.role, plan: only.plan } : null
  })

  const tenantItems = computed<AppNavItem[]>(() => {
    if (!navTenant.value) {
      return []
    }
    const base = `/t/${navTenant.value.slug}`
    // Staff open every feature, so they can support any account
    const locked = (feature: PlanFeature) => !user.value?.isPlatformAdmin && !planIncludes(navTenant.value!.plan, feature)
    return [
      { icon: 'i-lucide-message-square', label: 'Messages', to: `${base}/messages` },
      { icon: 'i-lucide-audio-lines', label: 'Recordings', to: `${base}/recordings`, locked: locked('recordings') },
      ...(hasRole(navTenant.value.role, 'admin') || user.value?.isPlatformAdmin
        ? [
            { icon: 'i-lucide-users', label: 'Members', to: `${base}/members` },
            { icon: 'i-lucide-settings', label: 'Settings', to: `${base}/settings` }
          ]
        : [])
    ]
  })

  const adminItems = computed<AppNavItem[]>(() => user.value?.isPlatformAdmin
    ? [{ icon: 'i-lucide-building-2', label: 'All tenants', to: '/admin/tenants' }]
    : [])

  function isActive(item: AppNavItem) {
    return route.path === item.to || (!item.exact && route.path.startsWith(`${item.to}/`))
  }

  return { tenantItems, adminItems, isActive }
}

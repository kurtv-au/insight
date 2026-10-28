export interface AppNavItem {
  icon: string
  label: string
  to: string
  /** Active only on this exact path, not on paths below it */
  exact?: boolean
}

/** Navigation shared by the desktop rail and the mobile tab bar */
export function useAppNav() {
  const route = useRoute()
  const { user } = useUserSession()
  const { tenant, can } = useTenant()

  const tenantItems = computed<AppNavItem[]>(() => {
    if (!tenant.value) {
      return []
    }
    const base = `/t/${tenant.value.slug}`
    return [
      { icon: 'i-lucide-layout-dashboard', label: 'Dashboard', to: base, exact: true },
      { icon: 'i-lucide-audio-lines', label: 'Recordings', to: `${base}/recordings` },
      ...(can('admin')
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

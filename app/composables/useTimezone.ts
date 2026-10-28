/**
 * The timezone dates are shown in: the user's own choice, else the current
 * account's, else their only account's, else Answer United's default.
 */
export function useTimezone() {
  const { user } = useUserSession()
  const { tenant } = useTenant()
  // Shares the cached `my-tenants` data the rail already loads
  const { data: myTenants } = useMyTenants()

  const timezone = computed(() => user.value?.timezone
    || tenant.value?.timezone
    || (myTenants.value.length === 1 ? myTenants.value[0]!.timezone : null)
    || DEFAULT_TIMEZONE)

  return {
    timezone,
    label: computed(() => timezoneLabel(timezone.value)),
    formatDate: (value: string | Date | null | undefined) => formatDate(value, timezone.value),
    formatDateTime: (value: string | Date | null | undefined) => formatDateTime(value, timezone.value)
  }
}

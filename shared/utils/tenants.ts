/**
 * New accounts start in `setup` while Answer United configures them. Only
 * platform admins can open an account that isn't `active`.
 */
export const TENANT_STATUSES = ['setup', 'active', 'suspended'] as const
export type TenantStatus = typeof TENANT_STATUSES[number]

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  setup: 'Setting up',
  active: 'Active',
  suspended: 'Suspended'
}

/** Whether a user can open a tenant they belong to. Platform admins can open any tenant. */
export function canOpenTenant(status: TenantStatus, isPlatformAdmin: boolean | undefined) {
  return status === 'active' || !!isPlatformAdmin
}

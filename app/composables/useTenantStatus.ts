/**
 * Changes a tenant's status (platform admins only), confirming the changes that
 * affect customers. Resolves `true` when the status was changed.
 */
export function useTenantStatus() {
  const confirm = useConfirm()
  const toast = useToast()

  return async (tenant: { id: string, name: string, status: TenantStatus }, status: TenantStatus) => {
    const options = status === 'suspended'
      ? { title: `Suspend ${tenant.name}?`, description: 'Members will lose access until the account is reactivated.', confirmLabel: 'Suspend' }
      : tenant.status === 'setup' && status === 'active'
        ? { title: `Take ${tenant.name} live?`, description: 'Anyone who has been invited will be able to open the account.', confirmLabel: 'Go live' }
        : null
    if (options && !await confirm(options)) {
      return false
    }

    try {
      await $fetch(`/api/admin/tenants/${tenant.id}`, { method: 'PATCH', body: { status } })
      return true
    } catch (err) {
      toast.add({ title: errorMessage(err), color: 'error' })
      return false
    }
  }
}

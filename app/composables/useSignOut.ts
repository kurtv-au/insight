export function useSignOut() {
  const { clear } = useUserSession()

  return async () => {
    await clear()
    clearNuxtData()
    clearNuxtState('tenant-context')
    await navigateTo('/login')
  }
}

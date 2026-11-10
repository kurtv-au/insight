export function useSignOut() {
  const { clear } = useUserSession()

  return async () => {
    await clear()
    clearNuxtData()
    // The last loaded message and recording lists are someone's own view
    // (message filters), so they go with the session
    clearNuxtState(key => key === 'tenant-context' || key.startsWith('messages-pages:') || key.startsWith('recordings-pages:'))
    await navigateTo('/login')
  }
}

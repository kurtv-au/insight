// Resolves the tenant for /t/[tenant] routes before rendering, so the layout and
// pages agree on the current tenant during SSR and hydration.
export default defineNuxtRouteMiddleware(async (to) => {
  const { context } = useTenant()
  const slug = typeof to.params.tenant === 'string' ? to.params.tenant : null

  if (!slug) {
    context.value = null
    return
  }

  // The server already resolved it for this request
  if (import.meta.client && useNuxtApp().isHydrating && context.value?.tenant.slug === slug) {
    return
  }

  try {
    context.value = await useRequestFetch()(`/api/me/tenants/${slug}`)
  } catch (err) {
    context.value = null
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500
    return abortNavigation(createError({ statusCode, message: errorMessage(err, 'Account not found'), fatal: true }))
  }
})

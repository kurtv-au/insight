// The address the support form delivers to (NUXT_SUPPORT_EMAIL), so the page's
// Customer Service card always shows the same inbox. null when it isn't set.
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return { email: useRuntimeConfig().support.email || null }
})

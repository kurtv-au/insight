// Restricts a page to Answer United platform admins
export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession()
  if (!user.value?.isPlatformAdmin) {
    return abortNavigation(createError({ statusCode: 403, message: 'You do not have access to this page' }))
  }
})

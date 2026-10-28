export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()

  if (to.meta.auth === 'guest' && loggedIn.value) {
    return navigateTo('/')
  }
  if (to.meta.auth === false || to.meta.auth === 'guest') {
    return
  }
  if (!loggedIn.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } })
  }
})

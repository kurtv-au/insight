<script setup lang="ts">
// An account opens on its messages, or on its recordings if its plan has
// recordings but not messages, so nobody lands on a locked page. This route
// stays so links to /t/[slug] (the account picker, invitations, older
// bookmarks) keep working.
const route = useRoute()
const { tenant } = useTenant()
const { user } = useUserSession()
const opensOnRecordings = !!tenant.value && !user.value?.isPlatformAdmin
  && !planIncludes(tenant.value.plan, 'messages') && planIncludes(tenant.value.plan, 'recordings')
await navigateTo(`/t/${route.params.tenant as string}/${opensOnRecordings ? 'recordings' : 'messages'}`, { replace: true })
</script>

<template>
  <div />
</template>

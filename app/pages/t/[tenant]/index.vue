<script setup lang="ts">
// An account opens on its messages. This route stays so links to /t/[slug]
// (the account picker, invitations, older bookmarks) keep working.
const route = useRoute()
await navigateTo(`/t/${route.params.tenant as string}/messages`, { replace: true })
</script>

<template>
  <div />
</template>

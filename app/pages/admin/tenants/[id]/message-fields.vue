<script setup lang="ts">
// The message-fields editor moved under the account, to
// /t/[tenant]/settings/message-fields. This keeps old links and bookmarks working.
definePageMeta({ middleware: 'admin' })

const route = useRoute()
const { data, error } = await useFetch(`/api/admin/tenants/${route.params.id as string}/message-fields`, {
  pick: ['tenant']
})
if (error.value || !data.value) {
  throw createError({ statusCode: error.value?.statusCode ?? 404, message: errorMessage(error.value, 'Tenant not found'), fatal: true })
}
await navigateTo(`/t/${data.value.tenant.slug}/settings/message-fields`, { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>

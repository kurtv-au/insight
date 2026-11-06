<script setup lang="ts">
// The #loading slot of a UTable whose rows come from au-api, which can take a few seconds
defineProps<{
  label: string
}>()
</script>

<template>
  <div
    class="flex flex-col items-center gap-2 py-10"
    role="status"
  >
    <UIcon
      name="i-lucide-loader-circle"
      class="size-6 animate-spin text-muted"
    />
    <p class="text-body-sm text-highlighted">
      {{ label }}
    </p>
    <p class="text-body-sm text-muted">
      This can take a few seconds.
    </p>
  </div>
</template>

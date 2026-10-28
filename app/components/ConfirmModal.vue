<script setup lang="ts">
// Opened with useOverlay(); resolves `true` when confirmed
defineProps<{
  title: string
  description?: string
  confirmLabel?: string
}>()

const emit = defineEmits<{ close: [confirmed: boolean] }>()
</script>

<template>
  <UModal
    :title="title"
    :description="description"
    :close="false"
    :dismissible="false"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="emit('close', false)"
        />
        <UButton
          :label="confirmLabel ?? 'Confirm'"
          color="error"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
// One message in the phone list: the first shown column leads, the received
// time (when shown) sits beside it, and the next two columns follow.
const props = defineProps<{
  message: MessageRow
  /** The person's shown field columns, in order */
  columns: MessageColumnField[]
  received: boolean
  selected?: boolean
  fresh?: boolean
}>()

defineEmits<{ open: [] }>()

const { timezone, formatDateTime } = useTimezone()

const lead = computed(() => props.columns[0])
const rest = computed(() => props.columns.slice(1, 3))
</script>

<template>
  <button
    type="button"
    class="block w-full px-4 py-3 text-left transition-colors hover:bg-elevated/60 focus-visible:bg-elevated focus-visible:outline-none"
    :class="[selected && 'bg-elevated', fresh && !selected && 'bg-cobalt-bg']"
    @click="$emit('open')"
  >
    <span class="flex items-baseline justify-between gap-3">
      <span class="min-w-0 truncate text-body-sm font-med text-highlighted">
        <template v-if="lead">
          <component :is="() => messageCell(message.fields[lead!.fieldKey], lead!, timezone, 'list')" />
        </template>
        <template v-else>{{ formatDateTime(message.createdAt, { zone: false }) }}</template>
      </span>
      <span
        v-if="received && lead"
        class="mono-meta shrink-0 tabular-nums"
      >{{ formatDateTime(message.createdAt, { zone: false }) }}</span>
    </span>
    <span
      v-for="field in rest"
      :key="field.fieldKey"
      class="mt-0.5 flex min-w-0 gap-1.5 text-body-sm text-muted"
    >
      <span class="shrink-0 text-dimmed">{{ field.label }}</span>
      <span class="min-w-0 truncate">
        <component :is="() => messageCell(message.fields[field.fieldKey], field, timezone, 'list')" />
      </span>
    </span>
  </button>
</template>

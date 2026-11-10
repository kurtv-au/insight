<script setup lang="ts">
// One recording in the phone list: when the call was, who called and how long
// it lasted. Only the columns the person shows appear.
const props = defineProps<{
  recording: RecordingDto
  columns: RecordingColumn[]
  selected?: boolean
}>()

defineEmits<{ open: [] }>()

const { formatDateTime } = useTimezone()
const shows = (column: RecordingColumn) => props.columns.includes(column)
</script>

<template>
  <button
    type="button"
    class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevated/60 focus-visible:bg-elevated focus-visible:outline-none"
    :class="selected && 'bg-elevated'"
    @click="$emit('open')"
  >
    <UIcon
      :name="selected ? 'i-lucide-audio-lines' : 'i-lucide-play'"
      class="size-4 shrink-0"
      :class="selected ? 'animate-pulse text-primary' : 'text-dimmed'"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-body-sm font-med text-highlighted tabular-nums">
        {{ formatDateTime(recording.startedAt, { zone: false }) }}
      </span>
      <span
        v-if="(shows('ani') && recording.ani !== undefined) || (shows('accountNumber') && recording.accountNumber)"
        class="mt-0.5 block truncate text-body-sm text-muted tabular-nums"
      >
        <template v-if="shows('ani') && recording.ani !== undefined">{{ formatPhone(recording.ani) }}</template>
        <template v-if="shows('ani') && recording.ani !== undefined && shows('accountNumber') && recording.accountNumber"> · </template>
        <template v-if="shows('accountNumber') && recording.accountNumber">#{{ recording.accountNumber }}</template>
      </span>
    </span>
    <span
      v-if="shows('duration') && recording.durationSeconds !== undefined"
      class="mono-meta shrink-0 tabular-nums"
    >{{ formatDuration(recording.durationSeconds) }}</span>
  </button>
</template>

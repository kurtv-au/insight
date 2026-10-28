<script setup lang="ts">
const props = defineProps<{
  tenantId: string
  recording: RecordingDto | null
  hasPrevious: boolean
  hasNext: boolean
}>()

// Steps through the list in its current order
const emit = defineEmits<{
  previous: []
  next: []
}>()

const open = defineModel<boolean>('open', { required: true })
const { formatDateTime } = useTimezone()

const recordingUrl = computed(() => props.recording
  ? `/api/tenants/${props.tenantId}/recordings/${encodeURIComponent(props.recording.id)}`
  : '')

// Only the fields the account can see come from the server
const details = computed(() => {
  const r = props.recording
  if (!r) {
    return []
  }
  return [
    { label: RECORDING_COLUMN_LABELS.timestamp, value: formatDateTime(r.startedAt) },
    r.ani !== undefined && { label: RECORDING_COLUMN_LABELS.ani, value: formatPhone(r.ani) },
    r.agent !== undefined && { label: RECORDING_COLUMN_LABELS.agent, value: r.agent },
    r.accountNumber !== undefined && { label: RECORDING_COLUMN_LABELS.accountNumber, value: r.accountNumber },
    r.durationSeconds !== undefined && { label: RECORDING_COLUMN_LABELS.duration, value: formatDuration(r.durationSeconds) }
  ].filter(item => !!item)
})
</script>

<template>
  <!-- Not modal, so the list stays usable: clicking another row switches recordings -->
  <USlideover
    v-model:open="open"
    side="right"
    :modal="false"
    :overlay="false"
    :content="{ onInteractOutside: (e: Event) => e.preventDefault() }"
    :title="recording ? formatDateTime(recording.startedAt) : 'Recording'"
    :description="recording?.ani !== undefined ? formatPhone(recording.ani) : 'Call recording'"
    :ui="{ content: 'max-w-full sm:max-w-md' }"
  >
    <template #body>
      <div
        v-if="recording"
        class="space-y-6"
      >
        <RecordingPlayer
          :key="recording.id"
          :src="`${recordingUrl}/audio`"
          :waveform-src="`${recordingUrl}/waveform`"
          autoplay
        />

        <dl class="divide-y divide-muted border-y border-muted">
          <div
            v-for="item in details"
            :key="item.label"
            class="flex items-baseline justify-between gap-4 py-3"
          >
            <dt class="kicker">
              {{ item.label }}
            </dt>
            <dd class="text-right text-body-sm text-highlighted tabular-nums">
              {{ item.value }}
            </dd>
          </div>
        </dl>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-between gap-2">
        <UButton
          label="Previous"
          icon="i-lucide-chevron-up"
          color="neutral"
          variant="outline"
          :disabled="!hasPrevious"
          @click="emit('previous')"
        />
        <UButton
          label="Next"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="outline"
          :disabled="!hasNext"
          @click="emit('next')"
        />
      </div>
    </template>
  </USlideover>
</template>

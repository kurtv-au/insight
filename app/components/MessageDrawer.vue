<script setup lang="ts">
const props = defineProps<{
  message: MessageRow | null
  /** The tenant's visible fields; the drawer shows those marked for the detail view */
  fields: MessageColumnField[]
  hasPrevious: boolean
  hasNext: boolean
}>()

// Steps through the list in its current order
const emit = defineEmits<{
  previous: []
  next: []
}>()

const open = defineModel<boolean>('open', { required: true })
const { timezone, formatDateTime } = useTimezone()

const shown = computed(() => detailFields(props.fields))
</script>

<template>
  <!-- Not modal, so the list stays usable: clicking another row switches messages -->
  <USlideover
    v-model:open="open"
    side="right"
    :modal="false"
    :overlay="false"
    :content="{ onInteractOutside: (e: Event) => e.preventDefault() }"
    :title="message ? formatDateTime(message.createdAt) : 'Message'"
    description="Message"
    :ui="{ content: 'max-w-full sm:max-w-md' }"
  >
    <template #body>
      <dl
        v-if="message"
        class="divide-y divide-muted border-y border-muted"
      >
        <div
          v-for="field in shown"
          :key="field.fieldKey"
          class="grid gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4"
        >
          <dt class="kicker">
            {{ field.label }}
          </dt>
          <dd class="text-body-sm text-highlighted sm:text-right">
            <component :is="() => messageCell(message!.fields[field.fieldKey], field, timezone, 'detail')" />
          </dd>
        </div>
      </dl>
      <AsideNote v-if="message && !shown.length">
        No fields are set to show in the detail view.
      </AsideNote>
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

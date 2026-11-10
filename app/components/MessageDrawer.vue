<script setup lang="ts">
const props = defineProps<{
  message: MessageRow | null
  /** The tenant's visible fields; the drawer shows those marked for the detail view */
  fields: MessageColumnField[]
  hasPrevious: boolean
  hasNext: boolean
  /** The received time as the title; the account can turn it off */
  showReceived?: boolean
}>()

// Steps through the list in its current order
const emit = defineEmits<{
  previous: []
  next: []
}>()

const open = defineModel<boolean>('open', { required: true })
const { timezone, formatDateTime } = useTimezone()
const toast = useToast()

const shown = computed(() => detailFields(props.fields))

// Without the received time, the first list fields with a value name the message
const heading = computed(() => {
  const message = props.message
  if (!message) {
    return { title: 'Message', subtitle: undefined }
  }
  const { title, subtitle } = messageHeadline(message, props.fields, timezone.value)
  if (props.showReceived !== false) {
    return { title: formatDateTime(message.createdAt), subtitle: title ?? undefined }
  }
  return { title: title ?? 'Message', subtitle: subtitle ?? undefined }
})

// Empty fields are left out unless asked for; the choice is remembered on this device
const SHOW_EMPTY_KEY = 'insight:message-drawer:show-empty'
const showEmpty = ref(false)
onMounted(() => {
  try {
    showEmpty.value = localStorage.getItem(SHOW_EMPTY_KEY) === '1'
  } catch {
    // Storage can be unavailable (private windows); the default applies
  }
})
watch(showEmpty, (value) => {
  try {
    localStorage.setItem(SHOW_EMPTY_KEY, value ? '1' : '0')
  } catch {
    // Not remembered, but still works
  }
})

function isEmptyValue(value: MessageFieldValue | undefined) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}
const emptyCount = computed(() => props.message ? shown.value.filter(field => isEmptyValue(props.message!.fields[field.fieldKey])).length : 0)
const visible = computed(() => showEmpty.value || !props.message
  ? shown.value
  : shown.value.filter(field => !isEmptyValue(props.message!.fields[field.fieldKey])))

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `${what} copied`, color: 'success' })
  } catch {
    toast.add({ title: `Couldn’t copy the ${what.toLowerCase()}`, description: 'Your browser didn’t allow it.', color: 'error' })
  }
}
function copyMessage() {
  if (props.message) {
    const received = props.showReceived !== false ? formatDateTime(props.message.createdAt) : undefined
    copy(messageAsText(props.message, props.fields, timezone.value, received), 'Message')
  }
}
function copyLink() {
  copy(window.location.href, 'Link')
}
</script>

<template>
  <!-- Not modal, so the list stays usable: clicking another row switches messages -->
  <USlideover
    v-model:open="open"
    side="right"
    :modal="false"
    :overlay="false"
    :content="{ onInteractOutside: (e: Event) => e.preventDefault() }"
    :title="heading.title"
    :description="heading.subtitle ?? 'Message'"
    :ui="{ content: 'max-w-full sm:max-w-md', description: heading.subtitle ? undefined : 'sr-only' }"
  >
    <template #body>
      <div
        v-if="message"
        class="mb-4 flex flex-wrap items-center gap-2"
      >
        <UButton
          label="Copy message"
          icon="i-lucide-copy"
          color="neutral"
          variant="outline"
          size="sm"
          @click="copyMessage"
        />
        <UButton
          label="Copy link"
          icon="i-lucide-link"
          color="neutral"
          variant="outline"
          size="sm"
          @click="copyLink"
        />
      </div>
      <dl
        v-if="message && visible.length"
        class="divide-y divide-muted border-y border-muted"
      >
        <!-- Short values sit beside their label; long text gets the full width under it -->
        <div
          v-for="field in visible"
          :key="field.fieldKey"
          class="grid gap-1 py-3"
          :class="field.type !== 'longText' && 'sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4'"
        >
          <dt class="kicker pt-0.5">
            {{ field.label }}
          </dt>
          <dd class="text-body-sm text-highlighted break-words">
            <component :is="() => messageCell(message!.fields[field.fieldKey], field, timezone, 'detail')" />
          </dd>
        </div>
      </dl>
      <AsideNote v-if="message && !shown.length">
        No fields are set to show in the detail view.
      </AsideNote>
      <UButton
        v-if="message && emptyCount"
        :label="showEmpty ? `Hide ${emptyCount} empty ${emptyCount === 1 ? 'field' : 'fields'}` : `Show ${emptyCount} empty ${emptyCount === 1 ? 'field' : 'fields'}`"
        :icon="showEmpty ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        color="neutral"
        variant="link"
        size="sm"
        class="mt-2 px-0"
        @click="showEmpty = !showEmpty"
      />
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

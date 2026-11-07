<script setup lang="ts">
// One selected field in the admin editor. Collapsed, it's a single line (name,
// key, type, warnings, list/detail placement, reordering, removal) so the list
// stays short enough to drag through; expanded, it adds the label, type and
// format settings. Reordering works by dragging the handle or from the
// keyboard (the move buttons, or Alt+↑/↓ on the handle).
const props = defineProps<{
  index: number
  count: number
  /** The field as the script publishes it, when it's in the script */
  scriptField: ScriptFieldDto | null
  orphaned: boolean
  /** The type the script suggests, when it disagrees with the chosen one */
  suggestedType: MessageFieldType | null
  expanded: boolean
  error?: string
}>()

const field = defineModel<MessageFieldConfig>('field', { required: true })

const emit = defineEmits<{
  move: [offset: number]
  remove: []
  toggle: []
}>()

function patch(changes: Partial<MessageFieldConfig>) {
  field.value = { ...field.value, ...changes }
}

function setType(type: MessageFieldType) {
  patch({ type, format: defaultFormatFor(type, props.scriptField) })
}

const typeItems = MESSAGE_FIELD_TYPES.map(type => ({ label: MESSAGE_FIELD_TYPE_LABELS[type], value: type }))
const name = computed(() => field.value.label || field.value.fieldKey)
const scriptLabel = computed(() => props.scriptField?.label ?? null)
const labelChanged = computed(() => !!scriptLabel.value && field.value.label !== scriptLabel.value)
const labelId = useId()
const settingsId = useId()

const placements = computed(() => [
  { key: 'showInList' as const, label: 'List', icon: 'i-lucide-rows-3', on: field.value.showInList, hint: 'list column' },
  { key: 'showInDetail' as const, label: 'Detail', icon: 'i-lucide-panel-right', on: field.value.showInDetail, hint: 'detail view' }
])
</script>

<template>
  <li
    data-field-row
    class="rounded-subtle border bg-default"
    :class="[orphaned ? 'border-warning/60' : error ? 'border-error/60' : 'border-default', !field.isActive && !expanded && 'opacity-70']"
  >
    <div class="flex flex-wrap items-center gap-x-1.5 gap-y-1 py-1 pr-1.5 pl-1">
      <UButton
        data-drag-handle
        icon="i-lucide-grip-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="shrink-0 cursor-grab active:cursor-grabbing"
        :aria-label="`Reorder ${name}, position ${index + 1} of ${count}. Drag, or press Alt and an arrow key.`"
        @keydown.alt.up.prevent="emit('move', -1)"
        @keydown.alt.down.prevent="emit('move', 1)"
      />

      <button
        type="button"
        class="flex min-w-48 flex-1 items-center gap-2 rounded-control py-1 text-left"
        :aria-expanded="expanded"
        :aria-controls="settingsId"
        @click="emit('toggle')"
      >
        <UIcon
          name="i-lucide-chevron-right"
          class="size-4 shrink-0 text-muted transition-transform"
          :class="expanded && 'rotate-90'"
          aria-hidden="true"
        />
        <span
          class="truncate text-body-sm text-highlighted"
          :title="name"
        >{{ name }}</span>
        <span
          v-if="field.label !== field.fieldKey"
          class="mono-meta hidden shrink-[4] truncate sm:inline"
        >{{ field.fieldKey }}</span>
        <span class="shrink-0 text-metadata text-muted">{{ MESSAGE_FIELD_TYPE_LABELS[field.type] }}</span>
        <span class="sr-only">{{ expanded ? 'Hide settings' : 'Show settings' }}</span>
      </button>

      <div class="flex shrink-0 flex-wrap items-center gap-1">
        <UBadge
          v-if="orphaned"
          label="Not in script"
          color="warning"
          variant="subtle"
          size="sm"
          icon="i-lucide-triangle-alert"
        />
        <UTooltip
          v-if="!isRetrievableFieldKey(field.fieldKey)"
          text="Messages can only load fields whose name starts with a letter or _ and uses letters, digits, _ . or -. This one will show as empty."
        >
          <UBadge
            label="Can’t be loaded"
            color="warning"
            variant="subtle"
            size="sm"
            icon="i-lucide-triangle-alert"
          />
        </UTooltip>
        <UTooltip
          v-if="suggestedType"
          :text="`The script treats this as ${MESSAGE_FIELD_TYPE_LABELS[suggestedType].toLowerCase()}`"
        >
          <UIcon
            name="i-lucide-info"
            class="size-4 text-primary"
            :aria-label="`The script treats ${name} as ${MESSAGE_FIELD_TYPE_LABELS[suggestedType].toLowerCase()}`"
          />
        </UTooltip>
        <UIcon
          v-if="error"
          name="i-lucide-circle-alert"
          class="size-4 text-error"
          :aria-label="`${name} has a problem`"
        />
        <UBadge
          v-if="!field.isActive"
          label="Inactive"
          color="neutral"
          variant="subtle"
          size="sm"
        />

        <UTooltip
          v-for="placement in placements"
          :key="placement.key"
          :text="placement.on ? `Shown as a ${placement.hint}` : `Not shown as a ${placement.hint}`"
        >
          <UButton
            :label="placement.label"
            :icon="placement.icon"
            :color="placement.on ? 'primary' : 'neutral'"
            :variant="placement.on ? 'soft' : 'ghost'"
            size="xs"
            :class="!placement.on && 'text-dimmed'"
            :aria-pressed="placement.on"
            :aria-label="`Show ${name} as a ${placement.hint}`"
            @click="patch({ [placement.key]: !placement.on })"
          />
        </UTooltip>

        <UButton
          data-action="up"
          icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === 0"
          :aria-label="`Move ${name} up`"
          @click="emit('move', -1)"
        />
        <UButton
          data-action="down"
          icon="i-lucide-arrow-down"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="index === count - 1"
          :aria-label="`Move ${name} down`"
          @click="emit('move', 1)"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          :aria-label="`Remove ${name}`"
          @click="emit('remove')"
        />
      </div>
    </div>

    <div
      v-if="expanded"
      :id="settingsId"
      class="border-t border-muted px-3 pt-3 pb-4 sm:pl-10"
    >
      <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
        <UFormField
          label="Label"
          :name="labelId"
        >
          <UInput
            :id="labelId"
            :model-value="field.label"
            class="w-full"
            @update:model-value="patch({ label: String($event) })"
          >
            <template
              v-if="labelChanged"
              #trailing
            >
              <UButton
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="link"
                size="xs"
                :aria-label="`Reset ${name} to the script's label, ${scriptLabel}`"
                @click="patch({ label: scriptLabel! })"
              />
            </template>
          </UInput>
        </UFormField>
        <UFormField label="Type">
          <USelect
            :model-value="field.type"
            :items="typeItems"
            class="w-full"
            :aria-label="`${name} type`"
            @update:model-value="setType($event as MessageFieldType)"
          />
        </UFormField>
      </div>

      <p class="mt-2 mono-meta break-all sm:hidden">
        {{ field.fieldKey }}
      </p>

      <p
        v-if="orphaned"
        class="mt-2 text-body-sm text-muted"
      >
        This field isn’t in the active script any more, so the messages page leaves it out unless you show it anyway.
      </p>

      <div
        v-if="suggestedType"
        class="mt-2 flex flex-wrap items-center gap-2 text-body-sm text-muted"
      >
        <UIcon
          name="i-lucide-info"
          class="size-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <span>The script treats this as {{ MESSAGE_FIELD_TYPE_LABELS[suggestedType].toLowerCase() }}. Your choice is kept.</span>
        <UButton
          :label="`Use ${MESSAGE_FIELD_TYPE_LABELS[suggestedType]}`"
          color="neutral"
          variant="link"
          size="xs"
          @click="setType(suggestedType)"
        />
      </div>

      <MessageFieldsFormatEditor
        :format="field.format"
        :type="field.type"
        :field-label="name"
        :script-choices="scriptField?.choices"
        class="mt-4"
        @update:format="patch({ format: $event })"
      />

      <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <USwitch
          :model-value="field.isActive"
          label="Active"
          @update:model-value="patch({ isActive: $event })"
        />
        <USwitch
          v-if="orphaned"
          :model-value="field.showIfOrphaned"
          label="Show anyway"
          @update:model-value="patch({ showIfOrphaned: $event })"
        />
      </div>

      <p
        v-if="error"
        class="mt-3 text-body-sm text-error"
        role="alert"
      >
        {{ error }}
      </p>
    </div>
  </li>
</template>

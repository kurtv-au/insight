<script setup lang="ts">
// One selected field in the admin editor: label, type and format, where it
// shows, reordering and removal. Reordering works by dragging the handle or
// from the keyboard (the move buttons, or Alt+↑/↓ on the handle).
const props = defineProps<{
  index: number
  count: number
  /** The field as the script publishes it, when it's in the script */
  scriptField: ScriptFieldDto | null
  orphaned: boolean
  /** The type the script suggests, when it disagrees with the chosen one */
  suggestedType: MessageFieldType | null
  error?: string
}>()

const field = defineModel<MessageFieldConfig>('field', { required: true })

const emit = defineEmits<{
  move: [offset: number]
  remove: []
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
</script>

<template>
  <li
    data-field-row
    class="rounded-standard border bg-default p-3 sm:p-4"
    :class="[orphaned ? 'border-warning/60' : 'border-default', !field.isActive && 'opacity-70']"
  >
    <div class="flex items-start gap-2">
      <UButton
        data-drag-handle
        icon="i-lucide-grip-vertical"
        color="neutral"
        variant="ghost"
        size="sm"
        class="mt-6 shrink-0 cursor-grab active:cursor-grabbing"
        :aria-label="`Reorder ${name}, position ${index + 1} of ${count}. Drag, or press Alt and an arrow key.`"
        @keydown.alt.up.prevent="emit('move', -1)"
        @keydown.alt.down.prevent="emit('move', 1)"
      />

      <div class="min-w-0 flex-1">
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

        <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="mono-meta break-all">{{ field.fieldKey }}</span>
          <UBadge
            v-if="orphaned"
            label="Not in script"
            color="warning"
            variant="subtle"
            size="sm"
            icon="i-lucide-triangle-alert"
          />
          <UBadge
            v-if="!field.isActive"
            label="Inactive"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>

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
            :model-value="field.showInList"
            label="List column"
            @update:model-value="patch({ showInList: $event })"
          />
          <USwitch
            :model-value="field.showInDetail"
            label="Detail view"
            @update:model-value="patch({ showInDetail: $event })"
          />
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

      <div class="flex shrink-0 flex-col gap-1">
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
  </li>
</template>

<script setup lang="ts">
import { useSortable } from '@vueuse/integrations/useSortable'

// The active script's fields. Click "Add", or drag one onto the selected list
// (the page handles the drop). Fields already added stay listed, marked.
const props = defineProps<{
  fields: ScriptDrift['available']
  /** Shared with the selected list so fields can be dragged between them */
  group: string
}>()

const emit = defineEmits<{
  add: [field: ScriptFieldDto]
}>()

const search = ref('')
const showVariables = ref(false)

const HINT_LABELS: Record<string, string> = {
  text: 'text',
  multiline: 'long text',
  phone: 'phone',
  number: 'number',
  postalCode: 'postal code',
  date: 'date',
  time: 'time',
  datetime: 'date and time',
  email: 'email',
  checkbox: 'checkbox',
  list: 'list'
}

const isVariable = (field: ScriptFieldDto) => !field.sources.includes('screen') && !field.sources.includes('callField')
const variableCount = computed(() => props.fields.filter(isVariable).length)

const shown = computed(() => {
  const needle = search.value.trim().toLowerCase()
  return props.fields.filter(field => (showVariables.value || !isVariable(field))
    && (!needle || field.key.toLowerCase().includes(needle) || field.label?.toLowerCase().includes(needle)))
})

function describe(field: ScriptFieldDto) {
  const parts = [
    field.inputType ? (HINT_LABELS[field.inputType] ?? field.inputType) : null,
    field.sources.includes('callField') ? 'call field' : null,
    isVariable(field) ? 'script variable' : null,
    field.required ? 'required' : null
  ]
  return parts.filter(Boolean).join(' · ')
}

// Drag source only: the selected list receives a copy and handles the drop.
// Fields already added aren't draggable.
const listEl = useTemplateRef<HTMLElement>('list')
useSortable(listEl, shown, {
  group: { name: props.group, pull: 'clone', put: false },
  sort: false,
  // Matches the selected list, which needs it for its <button> handles
  forceFallback: true,
  // The page's onAdd reads data-field-key from the dropped element
  draggable: '[data-draggable="true"]'
})
</script>

<template>
  <div>
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search script fields"
      aria-label="Search script fields"
      class="w-full"
    />

    <ul
      ref="list"
      class="mt-3 divide-y divide-muted border-y border-muted"
      aria-label="Script fields"
    >
      <li
        v-for="field in shown"
        :key="field.key"
        :data-field-key="field.key"
        :data-draggable="field.state === 'added' ? 'false' : 'true'"
        class="flex items-center gap-3 py-2.5"
        :class="field.state !== 'added' && 'cursor-grab active:cursor-grabbing'"
      >
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="truncate text-sm font-medium text-highlighted">{{ field.label ?? humanizeFieldKey(field.key) }}</span>
            <UBadge
              v-if="field.state === 'new'"
              label="New"
              color="primary"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-0.5 flex flex-wrap gap-x-2 text-body-sm text-muted">
            <span class="mono-meta break-all">{{ field.key }}</span>
            <span v-if="describe(field)">{{ describe(field) }}</span>
          </p>
        </div>
        <UButton
          v-if="field.state === 'added'"
          label="Added"
          icon="i-lucide-check"
          color="neutral"
          variant="ghost"
          size="sm"
          disabled
          :aria-label="`${field.label ?? field.key} is already added`"
        />
        <UButton
          v-else
          label="Add"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          :aria-label="`Add ${field.label ?? field.key}`"
          @click="emit('add', field)"
        />
      </li>
    </ul>

    <AsideNote
      v-if="!shown.length"
      class="mt-3"
    >
      {{ search ? 'No script fields match.' : 'This script has no fields to add.' }}
    </AsideNote>

    <USwitch
      v-if="variableCount"
      v-model="showVariables"
      :label="`Show script variables (${variableCount})`"
      description="Values the script sets for its own logic, with no control on a screen."
      class="mt-4"
    />
  </div>
</template>

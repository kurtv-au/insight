<script setup lang="ts">
// The format options for one field, which change with its type
const props = defineProps<{
  type: MessageFieldType
  /** Used to label every control uniquely, e.g. "Phone decimal places" */
  fieldLabel: string
  /** The script's list choices, offered as a reset for select options */
  scriptChoices?: { value: string, label: string }[] | null
}>()

const format = defineModel<MessageFieldFormat>('format', { required: true })

function patch(changes: Record<string, unknown>) {
  format.value = { ...format.value, ...changes } as MessageFieldFormat
}

const f = computed(() => format.value as Record<string, never>)

const DATE_STYLES = [
  { label: '10/28/2026', value: 'short' },
  { label: 'Oct 28, 2026', value: 'medium' },
  { label: 'October 28, 2026', value: 'long' }
]
const HOUR_CYCLES = [
  { label: '2:30 PM', value: '12h' },
  { label: '14:30', value: '24h' }
]
const PHONE_STYLES = [
  { label: '(269) 555-0134', value: 'national' },
  { label: 'As entered', value: 'raw' }
]

// Select options
const options = computed(() => (format.value as MessageFieldFormats['select']).options ?? [])
function setOption(index: number, changes: Partial<{ value: string, label: string }>) {
  patch({ options: options.value.map((option, i) => (i === index ? { ...option, ...changes } : option)) })
}
function removeOption(index: number) {
  patch({ options: options.value.filter((_, i) => i !== index) })
}
function addOption() {
  patch({ options: [...options.value, { value: '', label: '' }] })
}
function resetOptions() {
  patch({ options: (props.scriptChoices ?? []).map(choice => ({ value: choice.value, label: choice.label || choice.value })) })
}
</script>

<template>
  <div
    v-if="type !== 'text'"
    class="grid gap-3 sm:grid-cols-2"
  >
    <template v-if="type === 'longText'">
      <UFormField
        label="List length"
        help="Characters shown in the list before it's cut off"
      >
        <UInputNumber
          :model-value="f.listMaxChars"
          :min="20"
          :max="500"
          :step="10"
          :aria-label="`${fieldLabel} list length`"
          @update:model-value="patch({ listMaxChars: $event })"
        />
      </UFormField>
    </template>

    <template v-else-if="type === 'number' || type === 'currency'">
      <UFormField
        v-if="type === 'currency'"
        label="Currency"
      >
        <UInput
          :model-value="f.currency"
          maxlength="3"
          class="w-24 uppercase"
          :aria-label="`${fieldLabel} currency code`"
          @update:model-value="patch({ currency: String($event).toUpperCase() })"
        />
      </UFormField>
      <UFormField label="Decimal places">
        <UInputNumber
          :model-value="f.decimals"
          :min="0"
          :max="type === 'currency' ? 4 : 6"
          :aria-label="`${fieldLabel} decimal places`"
          @update:model-value="patch({ decimals: $event })"
        />
      </UFormField>
      <USwitch
        v-if="type === 'number'"
        :model-value="f.thousands"
        label="Thousands separator"
        class="self-end"
        :aria-label="`${fieldLabel} thousands separator`"
        @update:model-value="patch({ thousands: $event })"
      />
    </template>

    <template v-else-if="type === 'date' || type === 'datetime'">
      <UFormField label="Date style">
        <USelect
          :model-value="type === 'date' ? f.style : f.dateStyle"
          :items="DATE_STYLES"
          class="w-full"
          :aria-label="`${fieldLabel} date style`"
          @update:model-value="patch(type === 'date' ? { style: $event } : { dateStyle: $event })"
        />
      </UFormField>
      <template v-if="type === 'datetime'">
        <UFormField label="Clock">
          <USelect
            :model-value="f.hourCycle"
            :items="HOUR_CYCLES"
            class="w-full"
            :aria-label="`${fieldLabel} clock`"
            @update:model-value="patch({ hourCycle: $event })"
          />
        </UFormField>
        <USwitch
          :model-value="f.showZone"
          label="Show timezone"
          :aria-label="`${fieldLabel} show timezone`"
          @update:model-value="patch({ showZone: $event })"
        />
      </template>
    </template>

    <template v-else-if="type === 'time'">
      <UFormField label="Clock">
        <USelect
          :model-value="f.hourCycle"
          :items="HOUR_CYCLES"
          class="w-full"
          :aria-label="`${fieldLabel} clock`"
          @update:model-value="patch({ hourCycle: $event })"
        />
      </UFormField>
    </template>

    <template v-else-if="type === 'phone'">
      <UFormField label="Style">
        <USelect
          :model-value="f.style"
          :items="PHONE_STYLES"
          class="w-full"
          :aria-label="`${fieldLabel} phone style`"
          @update:model-value="patch({ style: $event })"
        />
      </UFormField>
    </template>

    <template v-else-if="type === 'email'">
      <USwitch
        :model-value="f.link"
        label="Link to email"
        :aria-label="`${fieldLabel} link to email`"
        @update:model-value="patch({ link: $event })"
      />
    </template>

    <template v-else-if="type === 'boolean'">
      <UFormField label="Shown when yes">
        <UInput
          :model-value="f.trueLabel"
          class="w-full"
          :aria-label="`${fieldLabel} label when yes`"
          @update:model-value="patch({ trueLabel: $event })"
        />
      </UFormField>
      <UFormField label="Shown when no">
        <UInput
          :model-value="f.falseLabel"
          class="w-full"
          :aria-label="`${fieldLabel} label when no`"
          @update:model-value="patch({ falseLabel: $event })"
        />
      </UFormField>
      <UFormField
        label="Stored value for yes"
        help="What the script saves when checked. True, Yes and 1 always count."
        class="sm:col-span-2"
      >
        <UInput
          :model-value="f.trueValue ?? ''"
          placeholder="True"
          class="w-full sm:max-w-48"
          :aria-label="`${fieldLabel} stored value for yes`"
          @update:model-value="patch({ trueValue: String($event) || undefined })"
        />
      </UFormField>
    </template>

    <template v-else-if="type === 'select'">
      <div class="sm:col-span-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-default">
            Options
          </p>
          <UButton
            v-if="scriptChoices?.length"
            label="Reset from script"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="resetOptions"
          />
        </div>
        <p class="mt-1 text-body-sm text-muted">
          Stored value, and the label shown for it.
        </p>
        <ul class="mt-2 space-y-2">
          <li
            v-for="(option, index) in options"
            :key="index"
            class="flex items-center gap-2"
          >
            <UInput
              :model-value="option.value"
              placeholder="Stored value"
              class="min-w-0 flex-1"
              :aria-label="`${fieldLabel} option ${index + 1} stored value`"
              @update:model-value="setOption(index, { value: String($event) })"
            />
            <UInput
              :model-value="option.label"
              placeholder="Label"
              class="min-w-0 flex-1"
              :aria-label="`${fieldLabel} option ${index + 1} label`"
              @update:model-value="setOption(index, { label: String($event) })"
            />
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Remove option ${index + 1} from ${fieldLabel}`"
              @click="removeOption(index)"
            />
          </li>
        </ul>
        <UButton
          label="Add option"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          size="sm"
          class="mt-2"
          @click="addOption"
        />
      </div>
    </template>
  </div>
</template>

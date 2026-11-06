<script setup lang="ts">
import type { CalendarDate } from '@internationalized/date'
import { today } from '@internationalized/date'

// A date-range button with presets and a calendar, shared by the recordings and
// messages lists. No dates means "Any time". Days are calendar days in `timezone`.
// With `maxDays`, ranges are capped at that many days and there is no "Any time".
const props = defineProps<{
  from?: CalendarDate
  to?: CalendarDate
  timezone: string
  /** The earliest day that can be picked; presets reaching further back are hidden */
  earliest?: CalendarDate
  /** A line under the calendar, e.g. how far back history goes */
  note?: string
  /** The longest range, in days counting both ends. Hides "Any time". */
  maxDays?: number
}>()

const emit = defineEmits<{
  change: [from?: CalendarDate, to?: CalendarDate]
}>()

const open = ref(false)
const todayDate = computed(() => today(props.timezone))

const presets = computed(() => {
  const t = todayDate.value
  return [
    { label: 'Today', from: t, to: t },
    { label: 'Yesterday', from: t.subtract({ days: 1 }), to: t.subtract({ days: 1 }) },
    { label: 'Last 7 days', from: t.subtract({ days: 6 }), to: t },
    { label: 'Last 30 days', from: t.subtract({ days: 29 }), to: t }
  ].filter(preset => (!props.earliest || preset.from.compare(props.earliest) >= 0)
    && (!props.maxDays || preset.to.compare(preset.from) < props.maxDays))
})

const shortDate = (date: CalendarDate) => formatDate(date.toDate(props.timezone), props.timezone).replace(/, \d{4}$/, '')
const label = computed(() => {
  const { from, to } = props
  if (!from || !to) {
    return 'Any time'
  }
  const preset = presets.value.find(p => p.from.compare(from) === 0 && p.to.compare(to) === 0)
  if (preset) {
    return preset.label
  }
  return from.compare(to) === 0 ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`
})

const calendarRange = computed({
  get: () => ({ start: props.from, end: props.to }),
  set: (range: { start?: CalendarDate, end?: CalendarDate } | null) => {
    if (range?.start && range.end) {
      choose(range.start, range.end)
    }
  }
})

function choose(from?: CalendarDate, to?: CalendarDate) {
  // The calendar enforces maxDays; this covers anything that gets past it
  if (props.maxDays && from && to && to.compare(from) >= props.maxDays) {
    from = to.subtract({ days: props.maxDays - 1 })
  }
  emit('change', from, to)
  open.value = false
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start' }"
  >
    <UButton
      :label="label"
      icon="i-lucide-calendar"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="outline"
    />
    <template #content>
      <div class="flex flex-col sm:flex-row">
        <div class="flex flex-row flex-wrap gap-1 border-b border-default p-2 sm:flex-col sm:border-r sm:border-b-0">
          <UButton
            v-for="preset in presets"
            :key="preset.label"
            :label="preset.label"
            color="neutral"
            :variant="label === preset.label ? 'soft' : 'ghost'"
            size="sm"
            @click="choose(preset.from, preset.to)"
          />
          <UButton
            v-if="!maxDays"
            label="Any time"
            color="neutral"
            :variant="label === 'Any time' ? 'soft' : 'ghost'"
            size="sm"
            @click="choose()"
          />
        </div>
        <div class="p-2">
          <UCalendar
            v-model="calendarRange"
            range
            :min-value="earliest"
            :max-value="todayDate"
            :maximum-days="maxDays"
          />
          <p
            v-if="note"
            class="mt-2 px-1 text-body-sm text-muted"
          >
            {{ note }}
          </p>
        </div>
      </div>
    </template>
  </UPopover>
</template>

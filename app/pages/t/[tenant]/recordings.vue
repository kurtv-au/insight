<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import type { CalendarDate } from '@internationalized/date'
import { parseDate, today } from '@internationalized/date'

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const toast = useToast()
const { tenant } = useTenant()
const { timezone, label: timezoneName, formatDateTime } = useTimezone()
useSeoMeta({ title: 'Recordings' })

// The parent route remounts this page when the tenant changes, so the ID is fixed
const tenantId = tenant.value!.id
const api = `/api/tenants/${tenantId}/recordings` as const

const { data: config, refresh: refreshConfig } = await useFetch(`${api}/config`)
const available = computed(() => config.value?.available ?? [])
const columns = ref<RecordingColumn[]>(config.value?.columns ?? ['timestamp'])
watch(() => config.value?.columns, (value) => {
  if (value) {
    columns.value = value
  }
})

// Filters, page and the open recording live in the URL
function queryString(key: string) {
  const value = route.query[key]
  return typeof value === 'string' && value ? value : undefined
}
function safeDate(value: string | undefined) {
  try {
    return value ? parseDate(value) : undefined
  } catch {
    return undefined
  }
}

const filters = computed(() => ({
  q: queryString('q'),
  from: safeDate(queryString('from')),
  to: safeDate(queryString('to')),
  min: Number(queryString('min')) || 0,
  account: queryString('acct'),
  page: Math.max(1, Math.floor(Number(queryString('page'))) || 1)
}))
const hasFilters = computed(() => !!(filters.value.q || filters.value.from || filters.value.min || filters.value.account))

// Sorting happens on the server. Only shown columns sort, so hiding the sorted
// column goes back to newest first.
const sort = computed(() => {
  const column = queryString('sort') as RecordingColumn | undefined
  const by = column && columns.value.includes(column) ? column : 'timestamp'
  const dir = queryString('dir')
  return { by, direction: dir === 'asc' || dir === 'desc' ? dir : RECORDING_SORT_DEFAULTS[by] }
})

function sortBy(column: RecordingColumn) {
  const direction = sort.value.by === column
    ? (sort.value.direction === 'asc' ? 'desc' : 'asc')
    : RECORDING_SORT_DEFAULTS[column]
  // Defaults stay out of the URL
  updateQuery({
    sort: column === 'timestamp' ? undefined : column,
    dir: direction === RECORDING_SORT_DEFAULTS[column] ? undefined : direction
  })
}

type QueryPatch = Record<string, string | number | undefined>

function updateQuery(patch: QueryPatch, { keepPage = false, replace = false } = {}) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...route.query, ...(keepPage ? {} : { page: undefined }), ...patch })) {
    if (value !== undefined && value !== null && value !== '' && value !== 0) {
      query[key] = String(value)
    }
  }
  return replace ? router.replace({ query }) : router.push({ query })
}

function clearFilters() {
  search.value = ''
  updateQuery({ q: undefined, from: undefined, to: undefined, min: undefined, acct: undefined })
}

// Calendar days become instants in the viewer's timezone; `to` is exclusive
const apiQuery = computed(() => ({
  page: filters.value.page,
  pageSize: PAGE_SIZE,
  q: filters.value.q,
  from: filters.value.from?.toDate(timezone.value).toISOString(),
  to: filters.value.to?.add({ days: 1 }).toDate(timezone.value).toISOString(),
  minDuration: filters.value.min || undefined,
  account: filters.value.account,
  sort: sort.value.by,
  dir: sort.value.direction
}))

const { data: results, status } = await useFetch(api, {
  query: apiQuery,
  default: () => ({ items: [] as RecordingDto[], total: 0 })
})
const loading = computed(() => status.value === 'pending')
const pageCount = computed(() => Math.max(1, Math.ceil(results.value.total / PAGE_SIZE)))

// Search, debounced so each keystroke doesn't add a request or history entry
const search = ref(filters.value.q ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => updateQuery({ q: value.trim() || undefined }, { replace: true }), 300)
})
watch(() => filters.value.q, (value) => {
  if ((value ?? '') !== search.value.trim()) {
    search.value = value ?? ''
  }
})
const searchPlaceholder = computed(() => {
  const parts = [available.value.includes('ani') && 'caller ID', available.value.includes('agent') && 'agent'].filter(Boolean)
  return parts.length ? `Search ${parts.join(' or ')}` : ''
})

// Date range
const todayDate = computed(() => today(timezone.value))
const presets = computed(() => {
  const t = todayDate.value
  return [
    { label: 'Today', from: t, to: t },
    { label: 'Yesterday', from: t.subtract({ days: 1 }), to: t.subtract({ days: 1 }) },
    { label: 'Last 7 days', from: t.subtract({ days: 6 }), to: t },
    { label: 'Last 30 days', from: t.subtract({ days: 29 }), to: t }
  ]
})
const dateOpen = ref(false)
const shortDate = (date: CalendarDate) => formatDate(date.toDate(timezone.value), timezone.value).replace(/, \d{4}$/, '')
const dateLabel = computed(() => {
  const { from, to } = filters.value
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
  get: () => ({ start: filters.value.from, end: filters.value.to }),
  set: (range: { start?: CalendarDate, end?: CalendarDate } | null) => {
    if (range?.start && range.end) {
      setDates(range.start, range.end)
    }
  }
})
function setDates(from?: CalendarDate, to?: CalendarDate) {
  updateQuery({ from: from?.toString(), to: to?.toString() })
  dateOpen.value = false
}

const durationItems = [
  { label: 'Any length', value: 0 },
  { label: '30 sec+', value: 30 },
  { label: '1 min+', value: 60 },
  { label: '5 min+', value: 300 }
]
const ALL_ACCOUNTS = 'all'
const accountItems = computed(() => [
  { label: 'All account numbers', value: ALL_ACCOUNTS },
  ...(config.value?.accountNumbers ?? []).map(number => ({ label: number, value: number }))
])
const showAccountFilter = computed(() => available.value.includes('accountNumber') && (config.value?.accountNumbers.length ?? 0) > 1)

// Columns: each user's own choice, saved per account
async function saveColumns(next: RecordingColumn[] | null) {
  if (next) {
    columns.value = next
  }
  try {
    await $fetch(`${api}/columns`, { method: 'PUT', body: { columns: next } })
    await refreshConfig()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    await refreshConfig()
  }
}

const columnMenu = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: 'Show columns' }],
  available.value.map(column => ({
    label: RECORDING_COLUMN_LABELS[column],
    type: 'checkbox' as const,
    checked: columns.value.includes(column),
    disabled: column === 'timestamp',
    onUpdateChecked: (checked: boolean) => saveColumns(normalizeColumns(checked
      ? [...columns.value, column]
      : columns.value.filter(c => c !== column))),
    onSelect: (e: Event) => e.preventDefault()
  })),
  [{
    label: 'Reset to account default',
    icon: 'i-lucide-rotate-ccw',
    disabled: !config.value?.mine,
    onSelect: () => saveColumns(null)
  }]
])

// Table
const UIcon = resolveComponent('UIcon')
const UButton = resolveComponent('UButton')
const selectedId = computed(() => queryString('r'))

const SORT_ICONS: Record<SortDirection, string> = { asc: 'i-lucide-arrow-up', desc: 'i-lucide-arrow-down' }

function sortHeader(column: RecordingColumn) {
  const label = RECORDING_COLUMN_LABELS[column]
  const active = sort.value.by === column
  return h(UButton, {
    'label': label,
    'color': 'neutral',
    'variant': 'ghost',
    'trailingIcon': active ? SORT_ICONS[sort.value.direction] : 'i-lucide-arrow-up-down',
    'class': '-mx-2.5 font-semibold',
    'ui': { trailingIcon: active ? 'text-primary' : 'text-dimmed' },
    'aria-label': active ? `${label}, sorted ${sort.value.direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`,
    'onClick': () => sortBy(column)
  })
}

const COLUMN_DEFS: Record<RecordingColumn, TableColumn<RecordingDto>> = {
  timestamp: {
    id: 'timestamp',
    header: () => sortHeader('timestamp'),
    cell: ({ row }) => h('span', { class: 'flex items-center gap-2 whitespace-nowrap' }, [
      row.original.id === selectedId.value
        ? h(UIcon, { 'name': 'i-lucide-audio-lines', 'class': 'size-4 shrink-0 animate-pulse text-primary', 'aria-label': 'Now playing' })
        : h(UIcon, { 'name': 'i-lucide-play', 'class': 'size-4 shrink-0 text-dimmed', 'aria-hidden': 'true' }),
      formatDateTime(row.original.startedAt)
    ])
  },
  ani: {
    id: 'ani',
    header: () => sortHeader('ani'),
    cell: ({ row }) => h('span', { class: ['whitespace-nowrap tabular-nums', !row.original.ani && 'text-muted'] }, formatPhone(row.original.ani))
  },
  agent: {
    id: 'agent',
    header: () => sortHeader('agent'),
    cell: ({ row }) => row.original.agent
  },
  accountNumber: {
    id: 'accountNumber',
    header: () => sortHeader('accountNumber'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, row.original.accountNumber)
  },
  duration: {
    id: 'duration',
    header: () => sortHeader('duration'),
    cell: ({ row }) => h('span', { class: 'tabular-nums' }, row.original.durationSeconds !== undefined ? formatDuration(row.original.durationSeconds) : ''),
    meta: { class: { th: 'text-right', td: 'text-right' } }
  }
}
const tableColumns = computed(() => columns.value.map(column => COLUMN_DEFS[column]))
const tableMeta = {
  class: {
    tr: (row: { original: RecordingDto }) => [
      'cursor-pointer transition-colors hover:bg-elevated/60',
      row.original.id === selectedId.value && 'bg-elevated'
    ].filter(Boolean).join(' ')
  }
}

// Drawer
const selectedIndex = computed(() => results.value.items.findIndex(r => r.id === selectedId.value))
// A shared link can point at a recording that isn't on this page of results, and
// sorting or filtering can move the open one off it, so remember the open one
const linkedRecording = ref<RecordingDto | null>(null)
watch(() => results.value.items[selectedIndex.value], (recording) => {
  if (recording) {
    linkedRecording.value = recording
  }
})
watch([selectedId, selectedIndex], async ([id, index]) => {
  if (id && index === -1 && linkedRecording.value?.id !== id) {
    try {
      linkedRecording.value = await requestFetch<RecordingDto>(`${api}/${encodeURIComponent(id)}`)
    } catch (err) {
      toast.add({ title: errorMessage(err, 'Recording not found'), color: 'error' })
      updateQuery({ r: undefined }, { keepPage: true, replace: true })
    }
  }
}, { immediate: true })

const selected = computed(() => results.value.items[selectedIndex.value]
  ?? (linkedRecording.value?.id === selectedId.value ? linkedRecording.value : null))
// On wide screens the list makes room for the open drawer instead of sitting under it
const drawerOpen = computed({
  get: () => !!selectedId.value,
  set: (open: boolean) => {
    if (!open) {
      updateQuery({ r: undefined }, { keepPage: true, replace: true })
    }
  }
})

function openRecording(recording: RecordingDto) {
  updateQuery({ r: recording.id }, { keepPage: true, replace: true })
}
function step(offset: number) {
  const next = results.value.items[selectedIndex.value + offset]
  if (next) {
    openRecording(next)
  }
}

function changePage(page: number) {
  updateQuery({ page, r: undefined }, { keepPage: true })
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
</script>

<template>
  <div
    class="mx-auto w-full max-w-[1100px] px-6 py-6 transition-[padding] duration-200 sm:px-8 lg:px-10 lg:py-8"
    :class="drawerOpen && 'xl:pr-[468px]'"
  >
    <PageHeader
      :kicker="tenant?.name ?? 'Account'"
      title="Recordings"
      :description="`Your recorded calls. Times are shown in ${timezoneName}.`"
    >
      <template #actions>
        <UDropdownMenu
          v-if="config?.hasAccountNumbers"
          :items="columnMenu"
          :content="{ align: 'end' }"
        >
          <UButton
            label="Columns"
            icon="i-lucide-columns-3"
            color="neutral"
            variant="outline"
          />
        </UDropdownMenu>
      </template>
    </PageHeader>

    <UAlert
      v-if="config && !config.hasAccountNumbers"
      class="mt-10"
      color="neutral"
      variant="subtle"
      icon="i-lucide-audio-lines"
      title="No recordings yet"
      description="Your call recordings will appear here once Answer United connects them to this account."
    />

    <template v-else>
      <div class="mt-10 flex flex-wrap items-center gap-2">
        <UInput
          v-if="searchPlaceholder"
          v-model="search"
          icon="i-lucide-search"
          :placeholder="searchPlaceholder"
          class="w-full sm:w-64"
          :aria-label="searchPlaceholder"
        />

        <UPopover
          v-model:open="dateOpen"
          :content="{ align: 'start' }"
        >
          <UButton
            :label="dateLabel"
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
                  :variant="dateLabel === preset.label ? 'soft' : 'ghost'"
                  size="sm"
                  @click="setDates(preset.from, preset.to)"
                />
                <UButton
                  label="Any time"
                  color="neutral"
                  :variant="dateLabel === 'Any time' ? 'soft' : 'ghost'"
                  size="sm"
                  @click="setDates()"
                />
              </div>
              <UCalendar
                v-model="calendarRange"
                range
                :max-value="todayDate"
                class="p-2"
              />
            </div>
          </template>
        </UPopover>

        <USelect
          v-if="available.includes('duration')"
          :model-value="filters.min"
          :items="durationItems"
          class="w-36"
          aria-label="Duration"
          @update:model-value="updateQuery({ min: $event })"
        />

        <USelect
          v-if="showAccountFilter"
          :model-value="filters.account ?? ALL_ACCOUNTS"
          :items="accountItems"
          class="w-48"
          aria-label="Account number"
          @update:model-value="updateQuery({ acct: $event === ALL_ACCOUNTS ? undefined : $event })"
        />

        <UButton
          v-if="hasFilters"
          label="Clear filters"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="clearFilters"
        />
      </div>

      <p class="mono-meta mt-6">
        {{ results.total.toLocaleString('en-US') }} {{ results.total === 1 ? 'recording' : 'recordings' }}<template v-if="pageCount > 1">
          · page {{ filters.page }} of {{ pageCount }}
        </template>
      </p>

      <UCard
        class="mt-3"
        :ui="{ body: 'p-0 sm:p-0' }"
      >
        <UTable
          :data="results.items"
          :columns="tableColumns"
          :meta="tableMeta"
          :loading="loading"
          :get-row-id="(row: RecordingDto) => row.id"
          :empty="hasFilters ? 'No recordings match these filters.' : 'No recordings yet.'"
          @select="(_e: Event, row: { original: RecordingDto }) => openRecording(row.original)"
        />
      </UCard>

      <div
        v-if="pageCount > 1"
        class="mt-6 flex justify-center"
      >
        <UPagination
          :page="filters.page"
          :total="results.total"
          :items-per-page="PAGE_SIZE"
          @update:page="changePage"
        />
      </div>
    </template>

    <RecordingDrawer
      v-model:open="drawerOpen"
      :tenant-id="tenantId"
      :recording="selected"
      :has-previous="selectedIndex > 0"
      :has-next="selectedIndex !== -1 && selectedIndex < results.items.length - 1"
      @previous="step(-1)"
      @next="step(1)"
    />
  </div>
</template>

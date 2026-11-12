<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { CalendarDate } from '@internationalized/date'
import { parseDate, today } from '@internationalized/date'

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const toast = useToast()
const { tenant } = useTenant()
const { timezone, label: timezoneName } = useTimezone()
useSeoMeta({ title: 'Messages' })

// The parent route remounts this page when the tenant changes, so the ID is fixed
const tenantId = tenant.value!.id
const api = `/api/tenants/${tenantId}/messages` as const

// A plan without messages shows them locked to its users, and nothing is
// fetched. Staff still open them, with a note. (Every plan includes them today.)
const { user: viewer } = useUserSession()
const planLacksMessages = computed(() => !planIncludes(tenant.value!.plan, 'messages'))
const messagesLocked = computed(() => planLacksMessages.value && !viewer.value?.isPlatformAdmin)

const { data: config, refresh: refreshConfig } = await useFetch(`${api}/config`, { immediate: !messagesLocked.value })
const fields = computed(() => config.value?.fields ?? [])

// Columns: each person's own choice of fields, and whether Received shows, saved per account
const columns = ref<string[]>(config.value?.columns ?? [])
const received = ref(config.value?.received ?? true)
watch(() => [config.value?.columns, config.value?.received] as const, ([value, showReceived]) => {
  if (value) {
    columns.value = value
    received.value = showReceived ?? true
  }
})

// Message filters the account assigned this person: they see only matching messages
const myFilters = computed(() => {
  const names = config.value?.filters ?? []
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
  return {
    names,
    summary: shown,
    title: `Your account shows you only messages matching ${names.length === 1 ? 'this filter' : 'one of these filters'}: ${names.join(', ')}`
  }
})

// Filters, page and the open message live in the URL
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

// au-api reads at most a week at a time, so a range is at most 7 days and there's
// no "Any time". With no dates in the URL the list shows today, which loads quickest.
const maxRangeDays = computed(() => config.value?.maxRangeDays ?? MAX_MESSAGE_RANGE_DAYS)
const historyDays = computed(() => config.value?.historyDays ?? DEFAULT_RECORDING_HISTORY_DAYS)
const todayDate = computed(() => today(timezone.value))
const earliestDate = computed(() => todayDate.value.subtract({ days: historyDays.value }))
function defaultRange() {
  return { from: todayDate.value, to: todayDate.value }
}

/** Dates from the URL, made into a range the API accepts: within history, no longer than the maximum */
function urlRange(from: CalendarDate | undefined, to: CalendarDate | undefined) {
  if (!from && !to) {
    return undefined
  }
  const span = maxRangeDays.value - 1
  let end = to ?? from!.add({ days: span })
  if (end.compare(todayDate.value) > 0) {
    end = todayDate.value
  }
  let start = from ?? end.subtract({ days: span })
  if (end.compare(start) > span) {
    start = end.subtract({ days: span })
  }
  if (start.compare(earliestDate.value) < 0) {
    start = earliestDate.value
  }
  if (end.compare(start) < 0) {
    end = start
  }
  return { from: start, to: end }
}

const filters = computed(() => {
  const range = urlRange(safeDate(queryString('from')), safeDate(queryString('to')))
  return {
    q: queryString('q'),
    ...(range ?? defaultRange()),
    datesChanged: !!range,
    page: Math.max(1, Math.floor(Number(queryString('page'))) || 1)
  }
})
const hasFilters = computed(() => !!(filters.value.q || filters.value.datesChanged))

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
  updateQuery({ q: undefined, from: undefined, to: undefined })
}

// Calendar days become instants in the viewer's timezone; `to` is exclusive
// Sorting: every shown column. Sorting by one that isn't shown (hidden since,
// or no longer a field) goes back to newest first.
const sort = computed<MessageSort>(() => {
  const requested = resolveMessageSort(fields.value, queryString('sort'), queryString('dir'))
  const shown = requested.fieldKey === null ? received.value : columns.value.includes(requested.fieldKey)
  return shown ? requested : { fieldKey: null, direction: 'desc' }
})

function sortBy(fieldKey: string | null) {
  const type = fieldKey === null ? null : fields.value.find(field => field.fieldKey === fieldKey)?.type ?? null
  const first = messageSortDefault(type)
  const direction = sort.value.fieldKey === fieldKey ? (sort.value.direction === 'asc' ? 'desc' : 'asc') : first
  // Defaults stay out of the URL
  updateQuery({ sort: fieldKey ?? undefined, dir: direction === first ? undefined : direction })
}

const apiQuery = computed(() => ({
  sort: sort.value.fieldKey ?? undefined,
  dir: isDefaultMessageSort(sort.value) ? undefined : sort.value.direction,
  page: filters.value.page,
  pageSize: PAGE_SIZE,
  q: filters.value.q,
  from: filters.value.from?.toDate(timezone.value).toISOString(),
  to: filters.value.to?.add({ days: 1 }).toDate(timezone.value).toISOString()
}))

// au-api can take several seconds over a busy week, so the page opens straight
// away and the list loads in the browser afterwards, with a loader meanwhile
const { data: fetched, status, error: loadError, refresh } = useFetch(api, {
  query: apiQuery,
  lazy: true,
  server: false,
  immediate: !!config.value?.configured,
  default: () => ({ items: [] as MessageRow[], total: 0, mock: false })
})

interface MessagePage { items: MessageRow[], total: number, mock: boolean }
// What the list shows is the last page that loaded. It stays (dimmed) while
// another loads, and the last few are kept for the visit, so coming back to
// Messages shows them at once and refreshes behind them.
const CACHED_PAGES = 8
// Per person as well as per account: what a person sees depends on their message filters
const { user: cacheUser } = useUserSession()
const pageCache = useState<Record<string, MessagePage>>(`messages-pages:${cacheUser.value?.id}:${tenantId}`, () => ({}))
const cacheKey = computed(() => JSON.stringify(apiQuery.value))
const shownPage = ref<MessagePage | null>(pageCache.value[cacheKey.value] ?? null)
watch(cacheKey, (key) => {
  const cached = pageCache.value[key]
  if (cached) {
    shownPage.value = cached
  }
})
// A refresh behind the shown list (returning to the page, or the automatic
// one) doesn't dim it, and messages it brings in are briefly highlighted
const quiet = ref(!!shownPage.value)
const lastUpdated = ref<number | null>(null)
const freshIds = ref(new Set<string>())
let freshTimer: ReturnType<typeof setTimeout> | undefined
watch(status, (value) => {
  if (value === 'error') {
    quiet.value = false
  }
  if (value !== 'success') {
    return
  }
  const page = fetched.value
  if (quiet.value && shownPage.value && cacheKey.value in pageCache.value) {
    const before = new Set(shownPage.value.items.map(message => message.id))
    const added = page.items.filter(message => !before.has(message.id)).map(message => message.id)
    if (added.length) {
      freshIds.value = new Set(added)
      clearTimeout(freshTimer)
      freshTimer = setTimeout(() => {
        freshIds.value = new Set()
      }, 8000)
    }
  }
  shownPage.value = page
  const kept = Object.entries(pageCache.value).filter(([key]) => key !== cacheKey.value).slice(-(CACHED_PAGES - 1))
  pageCache.value = { ...Object.fromEntries(kept), [cacheKey.value]: page }
  lastUpdated.value = Date.now()
  quiet.value = false
})
const results = computed<MessagePage>(() => shownPage.value ?? { items: [], total: 0, mock: false })
// 'idle' is the server render and the moment before the browser's first request
const fetching = computed(() => !!config.value?.configured && (status.value === 'pending' || status.value === 'idle'))
// Nothing to show yet: the full loader
const loading = computed(() => fetching.value && !shownPage.value)
// Something shown, and a new list on its way
const updating = computed(() => fetching.value && !!shownPage.value && !quiet.value)

// Export: every message matching the filters, across all pages, as CSV
const exporting = ref(false)
// Basic doesn't include exports: its users see the button locked. Staff can still export.
const planLacksExport = computed(() => !planIncludes(tenant.value!.plan, 'export'))
const exportLocked = computed(() => planLacksExport.value && !viewer.value?.isPlatformAdmin)
const canExport = computed(() => !!config.value?.configured && !fetching.value && !loadError.value && results.value.total > 0)

async function exportCsv() {
  if (!canExport.value || exporting.value) {
    return
  }
  exporting.value = true
  try {
    const { q, from, to, sort: sortKey, dir } = apiQuery.value
    const params = new URLSearchParams({ tz: timezone.value })
    for (const [key, value] of Object.entries({ q, from, to, sort: sortKey, dir })) {
      if (value) {
        params.set(key, value)
      }
    }
    const response = await fetch(`${api}/export?${params}`, { headers: { accept: 'text/csv' } })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null
      throw new Error(body?.message || 'Couldn’t export these messages. Please try again.')
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'messages.csv'
    const url = URL.createObjectURL(await response.blob())
    const link = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    toast.add({ title: err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'Couldn’t export these messages. Please try again.', color: 'error' })
  } finally {
    exporting.value = false
  }
}
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

// The default range stays out of the URL
function setDates(from?: CalendarDate, to?: CalendarDate) {
  const { from: defaultFrom, to: defaultTo } = defaultRange()
  const isDefault = !from || !to || (from.compare(defaultFrom) === 0 && to.compare(defaultTo) === 0)
  updateQuery(isDefault ? { from: undefined, to: undefined } : { from: from.toString(), to: to.toString() })
}

// Table: columns come from the tenant's configured fields
const selectedId = computed(() => queryString('m'))
const UButton = resolveComponent('UButton')
const SORT_ICONS: Record<SortDirection, string> = { asc: 'i-lucide-arrow-up', desc: 'i-lucide-arrow-down' }

function sortHeader(fieldKey: string | null, label: string) {
  const active = sort.value.fieldKey === fieldKey
  return h(UButton, {
    'label': label,
    'color': 'neutral',
    'variant': 'ghost',
    'trailingIcon': active ? SORT_ICONS[sort.value.direction] : 'i-lucide-arrow-up-down',
    'class': '-mx-2.5 font-semibold',
    'ui': { trailingIcon: active ? 'text-primary' : 'text-dimmed' },
    'aria-label': active ? `${label}, sorted ${sort.value.direction === 'asc' ? 'ascending' : 'descending'}` : `Sort by ${label}`,
    'onClick': () => sortBy(fieldKey)
  })
}

const tableColumns = computed(() => buildMessageColumns(fields.value, {
  timeZone: timezone.value,
  columns: columns.value,
  received: received.value,
  header: sortHeader
}))

async function saveColumns(next: { columns: string[], received: boolean } | null) {
  if (next) {
    columns.value = next.columns
    received.value = next.received
  }
  try {
    await $fetch(`${api}/columns`, { method: 'PUT', body: next ?? { columns: null } })
    await refreshConfig()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
    await refreshConfig()
  }
}

// Received (unless the account hides it) and every field the page shows can be
// columns. The last column shown can't be turned off, so the table never ends up empty.
const shownCount = computed(() => columns.value.length + (received.value ? 1 : 0))
const columnMenu = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: 'Show columns' }],
  [
    ...(config.value?.receivedSetting.available
      ? [{
          label: 'Received',
          type: 'checkbox' as const,
          checked: received.value,
          disabled: received.value && shownCount.value === 1,
          onUpdateChecked: (checked: boolean) => saveColumns({ columns: columns.value, received: checked }),
          onSelect: (e: Event) => e.preventDefault()
        }]
      : []),
    ...[...fields.value].sort((a, b) => a.order - b.order).map((field) => {
      const checked = columns.value.includes(field.fieldKey)
      return {
        label: field.label,
        type: 'checkbox' as const,
        checked,
        disabled: checked && shownCount.value === 1,
        onUpdateChecked: (on: boolean) => saveColumns({
          columns: fields.value
            .filter(f => f.fieldKey === field.fieldKey ? on : columns.value.includes(f.fieldKey))
            .map(f => f.fieldKey),
          received: received.value
        }),
        onSelect: (e: Event) => e.preventDefault()
      }
    })
  ],
  [{
    label: 'Reset to default',
    icon: 'i-lucide-rotate-ccw',
    disabled: !config.value?.mine,
    onSelect: () => saveColumns(null)
  }]
])
const tableMeta = {
  class: {
    tr: (row: { original: MessageRow }) => [
      'cursor-pointer transition-colors duration-700 hover:bg-elevated/60',
      row.original.id === selectedId.value ? 'bg-elevated' : freshIds.value.has(row.original.id) && 'bg-cobalt-bg'
    ].filter(Boolean).join(' ')
  }
}

// Drawer
const selectedIndex = computed(() => results.value.items.findIndex(m => m.id === selectedId.value))
// A shared link can point at a message that isn't on this page of results
const linkedMessage = ref<MessageRow | null>(null)
watch(() => results.value.items[selectedIndex.value], (message) => {
  if (message) {
    linkedMessage.value = message
  }
})
// Waits for the list, which usually has it
watch([selectedId, selectedIndex, fetching], async ([id, index, listLoading]) => {
  if (id && index === -1 && !listLoading && linkedMessage.value?.id !== id && config.value?.configured) {
    try {
      linkedMessage.value = await requestFetch<MessageRow>(`${api}/${encodeURIComponent(id)}`)
    } catch (err) {
      toast.add({ title: errorMessage(err, 'Message not found'), color: 'error' })
      updateQuery({ m: undefined }, { keepPage: true, replace: true })
    }
  }
}, { immediate: true })

const selected = computed(() => results.value.items[selectedIndex.value]
  ?? (linkedMessage.value?.id === selectedId.value ? linkedMessage.value : null))
// On wide screens the list makes room for the open drawer instead of sitting under it
const drawerOpen = computed({
  get: () => !!selectedId.value,
  set: (open: boolean) => {
    if (!open) {
      updateQuery({ m: undefined }, { keepPage: true, replace: true })
    }
  }
})

function openMessage(message: MessageRow) {
  updateQuery({ m: message.id }, { keepPage: true, replace: true })
}
function step(offset: number) {
  const next = results.value.items[selectedIndex.value + offset]
  if (next) {
    openMessage(next)
  }
}

function changePage(page: number) {
  updateQuery({ page, m: undefined }, { keepPage: true })
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

// Today's messages keep coming in: while the page is open and visible, on the
// first page of a range that includes today, the list refreshes every minute
const REFRESH_MS = 60_000
const now = ref(Date.now())
const watchesToday = computed(() => !!config.value?.configured && filters.value.page === 1 && filters.value.to.compare(todayDate.value) >= 0)
async function refreshList({ quietly = false } = {}) {
  if (fetching.value || exporting.value) {
    return
  }
  quiet.value = quietly
  await refresh()
}
function refreshIfStale() {
  now.value = Date.now()
  if (watchesToday.value && document.visibilityState === 'visible' && lastUpdated.value && now.value - lastUpdated.value >= REFRESH_MS) {
    refreshList({ quietly: true })
  }
}
let refreshTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshTimer = setInterval(refreshIfStale, 15_000)
  document.addEventListener('visibilitychange', refreshIfStale)
})
onBeforeUnmount(() => {
  clearInterval(refreshTimer)
  clearTimeout(freshTimer)
  document.removeEventListener('visibilitychange', refreshIfStale)
})
const updatedAgo = computed(() => {
  if (!lastUpdated.value) {
    return ''
  }
  const minutes = Math.floor((now.value - lastUpdated.value) / 60_000)
  return minutes < 1 ? 'updated just now' : `updated ${minutes} min ago`
})

// Phones have no column headers, so sorting is a menu of the shown columns
const cardColumns = computed(() => resolveMessageColumns(fields.value, columns.value))
// Without a Received column, the default order (when messages were taken) reads as "Newest first"
const defaultSortLabel = computed(() => received.value
  ? 'Received'
  : sort.value.fieldKey === null && sort.value.direction === 'asc' ? 'Oldest first' : 'Newest first')
const sortLabel = computed(() => sort.value.fieldKey === null
  ? defaultSortLabel.value
  : fields.value.find(field => field.fieldKey === sort.value.fieldKey)?.label ?? defaultSortLabel.value)
const sortMenu = computed<DropdownMenuItem[][]>(() => [[
  { key: null as string | null, label: defaultSortLabel.value },
  ...cardColumns.value.map(field => ({ key: field.fieldKey as string | null, label: field.label }))
].map(option => ({
  label: option.label,
  icon: sort.value.fieldKey === option.key ? SORT_ICONS[sort.value.direction] : undefined,
  onSelect: () => sortBy(option.key)
}))])

const emptyText = computed(() => {
  if (filters.value.q) {
    return 'No messages match this search.'
  }
  return filters.value.datesChanged ? 'No messages in this range.' : 'No messages today.'
})
const rangeNote = computed(() => `Messages go back ${historyDays.value} ${historyDays.value === 1 ? 'day' : 'days'}, up to ${maxRangeDays.value} days at a time.`)
</script>

<template>
  <div
    class="w-full px-6 py-6 transition-[padding] duration-200 sm:px-8 lg:px-10 lg:py-8"
    :class="drawerOpen && 'xl:pr-[488px]'"
  >
    <!-- Wider than other pages so the configured columns fit; the open drawer takes
         its width off the side rather than out of the content cap -->
    <div class="mx-auto w-full max-w-[1600px]">
      <PageHeader
        :kicker="tenant?.name ?? 'Account'"
        title="Messages"
        :description="`Messages taken on your behalf. Times are shown in ${timezoneName}.`"
      >
        <template
          v-if="config?.configured"
          #actions
        >
          <UDropdownMenu
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
          <UPopover v-if="exportLocked">
            <UButton
              label="Export CSV"
              icon="i-lucide-lock"
              color="neutral"
              variant="outline"
            />
            <template #content>
              <PlanLocked
                class="p-4"
                feature="export"
                title="Export CSV"
                compact
              />
            </template>
          </UPopover>
          <UTooltip
            v-else
            :text="`Not in the ${PLAN_LABELS[tenant!.plan]} plan. You can export as Answer United staff.`"
            :disabled="!planLacksExport"
          >
            <UButton
              label="Export CSV"
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              :loading="exporting"
              :disabled="!canExport"
              @click="exportCsv"
            />
          </UTooltip>
        </template>
      </PageHeader>

      <AsideNote
        v-if="planLacksMessages && !messagesLocked"
        class="mt-6"
      >
        This account’s {{ PLAN_LABELS[tenant!.plan] }} plan doesn’t include messages. You can open them as Answer United staff; its users see an upgrade notice.
      </AsideNote>

      <PlanLocked
        v-if="messagesLocked"
        class="mt-10"
        feature="messages"
        title="Messages"
      />

      <template v-else-if="config && !config.configured">
        <UAlert
          v-if="config.canConfigure"
          class="mt-10"
          color="neutral"
          variant="subtle"
          icon="i-lucide-list-checks"
          title="Messages aren’t set up for this account yet"
          description="Choose which fields of the account’s script the messages list shows."
          :actions="[{ label: 'Set up message fields', to: `/t/${tenant?.slug}/settings/message-fields`, color: 'neutral', variant: 'outline', icon: 'i-lucide-arrow-right' }]"
        />
        <UAlert
          v-else
          class="mt-10"
          color="neutral"
          variant="subtle"
          icon="i-lucide-message-square"
          title="Messages aren’t set up yet"
          description="Messages taken for this account will appear here once Answer United finishes setting them up."
        />
      </template>

      <template v-else-if="config">
        <div class="mt-10 flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search messages"
            class="w-full sm:w-64"
            aria-label="Search messages"
          />

          <DateRangeFilter
            :from="filters.from"
            :to="filters.to"
            :timezone="timezone"
            :earliest="earliestDate"
            :max-days="maxRangeDays"
            :note="rangeNote"
            @change="setDates"
          />

          <UDropdownMenu
            :items="sortMenu"
            class="sm:hidden"
          >
            <UButton
              :label="`Sort: ${sortLabel}`"
              :trailing-icon="sort.fieldKey === null && !received ? undefined : SORT_ICONS[sort.direction]"
              color="neutral"
              variant="outline"
              class="sm:hidden"
            />
          </UDropdownMenu>

          <UButton
            v-if="hasFilters"
            label="Clear filters"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            @click="clearFilters"
          />
        </div>

        <UAlert
          v-if="loadError && !loading"
          class="mt-6"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="errorMessage(loadError, 'Couldn’t load messages')"
          description="Your filters are kept. Try again in a moment."
          :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', icon: 'i-lucide-refresh-cw', onClick: () => refresh() }]"
        />

        <div
          v-else
          class="mt-6 flex min-h-6 flex-wrap items-center gap-x-1.5"
        >
          <p
            v-if="!loading"
            class="mono-meta"
          >
            {{ results.total.toLocaleString('en-US') }} {{ results.total === 1 ? 'message' : 'messages' }}<template v-if="pageCount > 1">
              · page {{ filters.page }} of {{ pageCount }}
            </template><template v-if="myFilters.names.length">
              · <span :title="myFilters.title">only {{ myFilters.summary }}</span>
            </template><template v-if="results.mock">
              · sample data
            </template><template v-if="updatedAgo && watchesToday">
              · {{ updatedAgo }}
            </template>
          </p>
          <UButton
            v-if="!loading"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="fetching"
            aria-label="Refresh messages"
            @click="refreshList()"
          />
        </div>

        <UCard
          class="mt-3 transition-opacity"
          :class="updating && 'opacity-60'"
          :ui="{ body: 'p-0 sm:p-0' }"
        >
          <UTable
            class="hidden sm:block"
            :data="loadError ? [] : results.items"
            :columns="tableColumns"
            :meta="tableMeta"
            :ui="{ th: 'whitespace-nowrap' }"
            :loading="loading"
            :get-row-id="(row: MessageRow) => row.id"
            :empty="loadError ? 'Messages couldn’t be loaded.' : emptyText"
            @select="(_e: Event, row: { original: MessageRow }) => openMessage(row.original)"
          >
            <template #loading>
              <TableLoading label="Loading messages…" />
            </template>
          </UTable>

          <!-- Phones: one card per message instead of a table too wide to read -->
          <div class="sm:hidden">
            <TableLoading
              v-if="loading"
              label="Loading messages…"
            />
            <p
              v-else-if="loadError || !results.items.length"
              class="px-4 py-10 text-center text-body-sm text-muted"
            >
              {{ loadError ? 'Messages couldn’t be loaded.' : emptyText }}
            </p>
            <div
              v-else
              class="divide-y divide-muted"
            >
              <MessageCard
                v-for="message in results.items"
                :key="message.id"
                :message="message"
                :columns="cardColumns"
                :received="received"
                :selected="message.id === selectedId"
                :fresh="freshIds.has(message.id)"
                @open="openMessage(message)"
              />
            </div>
          </div>
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
    </div>

    <MessageDrawer
      v-model:open="drawerOpen"
      :message="selected"
      :fields="fields"
      :show-received="config?.receivedSetting.showInDetail ?? true"
      :has-previous="selectedIndex > 0"
      :has-next="selectedIndex !== -1 && selectedIndex < results.items.length - 1"
      @previous="step(-1)"
      @next="step(1)"
    />
  </div>
</template>

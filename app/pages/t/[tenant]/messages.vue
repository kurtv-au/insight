<script setup lang="ts">
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

const { data: config } = await useFetch(`${api}/config`)
const fields = computed(() => config.value?.fields ?? [])

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

// With no dates in the URL the list shows the last 7 days, counting today; "Any time" is range=all
const DEFAULT_RANGE_DAYS = 7
const todayDate = computed(() => today(timezone.value))
function defaultRange() {
  return { from: todayDate.value.subtract({ days: DEFAULT_RANGE_DAYS - 1 }), to: todayDate.value }
}

const filters = computed(() => {
  const from = safeDate(queryString('from'))
  const to = safeDate(queryString('to'))
  const anyTime = queryString('range') === 'all'
  return {
    q: queryString('q'),
    ...(from || to ? { from, to } : anyTime ? { from: undefined, to: undefined } : defaultRange()),
    datesChanged: !!(from || to) || anyTime,
    page: Math.max(1, Math.floor(Number(queryString('page'))) || 1)
  }
})
const hasFilters = computed(() => !!(filters.value.q || filters.value.datesChanged))
// Development only: generated sample rows in the configured layout
const mock = computed(() => !!config.value?.mockAvailable && queryString('mock') === '1')

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
  updateQuery({ q: undefined, from: undefined, to: undefined, range: undefined })
}

// Calendar days become instants in the viewer's timezone; `to` is exclusive
const apiQuery = computed(() => ({
  page: filters.value.page,
  pageSize: PAGE_SIZE,
  q: filters.value.q,
  from: filters.value.from?.toDate(timezone.value).toISOString(),
  to: filters.value.to?.add({ days: 1 }).toDate(timezone.value).toISOString(),
  mock: mock.value ? '1' : undefined
}))

const { data: results, status } = await useFetch(api, {
  query: apiQuery,
  immediate: !!config.value?.configured,
  default: () => ({ items: [] as MessageRow[], total: 0, mock: false })
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

// No dates means any time; the default range stays out of the URL
function setDates(from?: CalendarDate, to?: CalendarDate) {
  const { from: defaultFrom, to: defaultTo } = defaultRange()
  const isDefault = from && to && from.compare(defaultFrom) === 0 && to.compare(defaultTo) === 0
  updateQuery(from && to && !isDefault
    ? { from: from.toString(), to: to.toString(), range: undefined }
    : { from: undefined, to: undefined, range: isDefault ? undefined : 'all' })
}

// Table: columns come from the tenant's configured fields
const selectedId = computed(() => queryString('m'))
const tableColumns = computed(() => buildMessageColumns(fields.value, { timeZone: timezone.value }))
const tableMeta = {
  class: {
    tr: (row: { original: MessageRow }) => [
      'cursor-pointer transition-colors hover:bg-elevated/60',
      row.original.id === selectedId.value && 'bg-elevated'
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
watch([selectedId, selectedIndex], async ([id, index]) => {
  if (id && index === -1 && linkedMessage.value?.id !== id && config.value?.configured) {
    try {
      linkedMessage.value = await requestFetch<MessageRow>(`${api}/${encodeURIComponent(id)}`, { query: { mock: mock.value ? '1' : undefined } })
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

const emptyText = computed(() => {
  if (hasFilters.value) {
    return 'No messages match these filters.'
  }
  return `No messages in the last ${DEFAULT_RANGE_DAYS} days.`
})
</script>

<template>
  <div
    class="mx-auto w-full max-w-[1100px] px-6 py-6 transition-[padding] duration-200 sm:px-8 lg:px-10 lg:py-8"
    :class="drawerOpen && 'xl:pr-[468px]'"
  >
    <PageHeader
      :kicker="tenant?.name ?? 'Account'"
      title="Messages"
      :description="`Messages taken on your behalf. Times are shown in ${timezoneName}.`"
    >
      <template #actions>
        <USwitch
          v-if="config?.mockAvailable && config.configured"
          :model-value="mock"
          label="Sample data"
          description="Development only"
          @update:model-value="updateQuery({ mock: $event ? '1' : undefined, m: undefined })"
        />
      </template>
    </PageHeader>

    <template v-if="config && !config.configured">
      <UAlert
        v-if="config.canConfigure"
        class="mt-10"
        color="neutral"
        variant="subtle"
        icon="i-lucide-list-checks"
        title="Messages aren’t set up for this account yet"
        description="Choose which fields of the account’s script the messages list shows."
        :actions="[{ label: 'Set up message fields', to: `/admin/tenants/${tenantId}/message-fields`, color: 'neutral', variant: 'outline', icon: 'i-lucide-arrow-right' }]"
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
          @change="setDates"
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
        {{ results.total.toLocaleString('en-US') }} {{ results.total === 1 ? 'message' : 'messages' }}<template v-if="pageCount > 1">
          · page {{ filters.page }} of {{ pageCount }}
        </template><template v-if="results.mock">
          · sample data
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
          :get-row-id="(row: MessageRow) => row.id"
          :empty="emptyText"
          @select="(_e: Event, row: { original: MessageRow }) => openMessage(row.original)"
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

    <MessageDrawer
      v-model:open="drawerOpen"
      :message="selected"
      :fields="fields"
      :has-previous="selectedIndex > 0"
      :has-next="selectedIndex !== -1 && selectedIndex < results.items.length - 1"
      @previous="step(-1)"
      @next="step(1)"
    />
  </div>
</template>

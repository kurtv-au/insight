<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Audit log' })

const { formatDateTime } = useTimezone()

const ALL = 'all'
const page = ref(1)
const tenantFilter = ref<string>(ALL)
watch(tenantFilter, () => {
  page.value = 1
})

const { data: tenants } = await useFetch('/api/admin/tenants', { default: () => [] })
const tenantItems = computed(() => [
  { label: 'Every account', value: ALL },
  ...tenants.value.map(tenant => ({ label: tenant.name, value: tenant.id }))
])

const query = computed(() => ({
  page: page.value,
  tenantId: tenantFilter.value === ALL ? undefined : tenantFilter.value
}))
const { data, status } = await useFetch('/api/admin/audit', {
  query,
  default: () => ({ items: [] as AuditEventDto[], total: 0, pageSize: 50 })
})
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Admin"
      title="Audit log"
      description="Who changed access or setup, and when: platform admins, accounts, roles, invitations and message filters."
    />

    <section class="mt-10">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <SectionKicker
          number="01"
          label="Changes"
          :count="data.total ? `${data.total}` : undefined"
          class="min-w-0 flex-1"
        />
        <USelectMenu
          v-model="tenantFilter"
          :items="tenantItems"
          value-key="value"
          class="w-full sm:w-64"
          aria-label="Show changes for"
        />
      </div>

      <div
        v-if="data.items.length"
        class="divide-y divide-muted rounded-standard border border-default"
        :class="{ 'opacity-60': status === 'pending' }"
      >
        <div
          v-for="item in data.items"
          :key="item.id"
          class="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
        >
          <div class="min-w-0">
            <p class="text-body-sm text-highlighted">
              {{ describeAuditEvent(item) }}
            </p>
            <p class="mono-meta truncate">
              {{ item.actorEmail }}<template v-if="item.tenantName">
                · {{ item.tenantName }}
              </template>
            </p>
          </div>
          <p class="mono-meta sm:text-right">
            {{ formatDateTime(item.createdAt) }}
          </p>
        </div>
      </div>
      <p
        v-else
        class="text-body-sm text-muted"
      >
        Nothing recorded yet.
      </p>

      <div
        v-if="data.total > data.pageSize"
        class="mt-4 flex justify-center"
      >
        <UPagination
          v-model:page="page"
          :total="data.total"
          :items-per-page="data.pageSize"
        />
      </div>
    </section>
  </div>
</template>

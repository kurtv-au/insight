<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Plans' })

const { data: tenants } = await useFetch('/api/admin/tenants', { default: () => [] })

// Every plan in tier order, with its accounts (already sorted by name)
const plans = computed(() => PLANS.map(plan => ({
  plan,
  tenants: tenants.value.filter(tenant => tenant.plan === plan)
})))

function sectionNumber(index: number) {
  return String(index + 1).padStart(2, '0')
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Admin"
      title="Plans"
      description="Every account is on a plan, which will decide the features it has. Change an account’s plan in its Settings."
    >
      <template #actions>
        <UButton
          icon="i-lucide-building-2"
          color="neutral"
          variant="outline"
          to="/admin/tenants"
          aria-label="All accounts"
        >
          <span class="hidden sm:inline">All accounts</span>
        </UButton>
      </template>
    </PageHeader>

    <AsideNote class="mt-6">
      Plans don’t change any features yet.
    </AsideNote>

    <section
      v-for="(group, index) in plans"
      :key="group.plan"
      class="mt-10"
      :aria-label="`${PLAN_LABELS[group.plan]} accounts`"
    >
      <SectionKicker
        :number="sectionNumber(index)"
        :label="PLAN_LABELS[group.plan]"
        :count="`${group.tenants.length}`"
        class="mb-3"
      />
      <div
        v-if="group.tenants.length"
        class="divide-y divide-muted rounded-standard border border-default"
      >
        <div
          v-for="tenant in group.tenants"
          :key="tenant.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-body-sm text-highlighted">
              <NuxtLink
                :to="`/t/${tenant.slug}`"
                class="truncate decoration-primary decoration-2 underline-offset-[5px] hover:underline"
              >{{ tenant.name }}</NuxtLink>
              <UBadge
                v-if="tenant.status !== 'active'"
                :label="TENANT_STATUS_LABELS[tenant.status]"
                :color="tenant.status === 'suspended' ? 'warning' : 'primary'"
                variant="subtle"
                size="sm"
              />
            </p>
            <p class="mono-meta truncate">
              /t/{{ tenant.slug }} · {{ tenant.memberCount }} {{ tenant.memberCount === 1 ? 'member' : 'members' }}
            </p>
          </div>
          <UButton
            icon="i-lucide-settings"
            color="neutral"
            variant="ghost"
            size="sm"
            :to="`/t/${tenant.slug}/settings`"
            :aria-label="`Change ${tenant.name}’s plan`"
          />
        </div>
      </div>
      <p
        v-else
        class="text-body-sm text-muted"
      >
        No accounts on {{ PLAN_LABELS[group.plan] }}.
      </p>
    </section>
  </div>
</template>

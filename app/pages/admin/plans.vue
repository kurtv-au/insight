<script setup lang="ts">
definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Plans' })

const { data: tenants } = await useFetch('/api/admin/tenants', { default: () => [] })
type Tenant = typeof tenants.value[number]

// Every plan in tier order, with its accounts (already sorted by name)
const plans = computed(() => PLANS.map(plan => ({
  plan,
  tenants: tenants.value.filter(tenant => tenant.plan === plan)
})))

function sectionNumber(index: number) {
  return String(index + 2).padStart(2, '0')
}

// Users the plan counts: members and pending invitations
function seatsUsed(tenant: Tenant) {
  return tenant.memberCount + tenant.pendingInvites
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Admin"
      title="Plans"
      description="Every account is on a plan, which decides what its users get. Change an account’s plan in its Settings. Staff open every feature whatever the plan."
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

    <section
      class="mt-10"
      aria-labelledby="plan-features-heading"
    >
      <SectionKicker
        number="01"
        label="What each plan includes"
        class="mb-3"
      />
      <h2
        id="plan-features-heading"
        class="sr-only"
      >
        What each plan includes
      </h2>
      <div class="overflow-x-auto rounded-standard border border-default">
        <table class="w-full min-w-[560px] text-body-sm">
          <thead>
            <tr class="border-b border-default text-left">
              <th
                scope="col"
                class="px-4 py-3 font-medium text-muted"
              >
                Feature
              </th>
              <th
                v-for="plan in PLANS"
                :key="plan"
                scope="col"
                class="px-4 py-3 text-center font-medium text-highlighted"
              >
                {{ PLAN_LABELS[plan] }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-muted">
            <tr>
              <th
                scope="row"
                class="px-4 py-2.5 text-left font-normal text-default"
              >
                Number of users
              </th>
              <td
                v-for="plan in PLANS"
                :key="plan"
                class="px-4 py-2.5 text-center text-default"
              >
                Up to {{ planMaxUsers(plan) }}
              </td>
            </tr>
            <tr>
              <th
                scope="row"
                class="px-4 py-2.5 text-left font-normal text-default"
              >
                Data retention (history)
              </th>
              <td
                v-for="plan in PLANS"
                :key="plan"
                class="px-4 py-2.5 text-center text-default"
              >
                {{ describeHistoryDays(planHistoryDays(plan)) }}
              </td>
            </tr>
            <tr
              v-for="feature in PLAN_FEATURES"
              :key="feature.key"
            >
              <th
                scope="row"
                class="px-4 py-2.5 text-left font-normal text-default"
              >
                {{ feature.label }}
                <span
                  v-if="!feature.enforced"
                  class="mono-meta block"
                >Not enforced in the app</span>
              </th>
              <td
                v-for="plan in PLANS"
                :key="plan"
                class="px-4 py-2.5 text-center"
              >
                <UIcon
                  v-if="planIncludes(plan, feature.key)"
                  name="i-lucide-check"
                  class="size-4 text-primary"
                  :aria-label="`Included in ${PLAN_LABELS[plan]}`"
                />
                <span
                  v-else
                  class="text-dimmed"
                  :aria-label="`Not in ${PLAN_LABELS[plan]}`"
                >–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

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
              <UBadge
                v-if="seatsUsed(tenant) > planMaxUsers(tenant.plan)"
                label="Over its user limit"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </p>
            <p class="mono-meta truncate">
              /t/{{ tenant.slug }} · {{ seatsUsed(tenant) }} of {{ planMaxUsers(tenant.plan) }} users
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

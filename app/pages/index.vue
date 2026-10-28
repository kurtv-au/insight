<script setup lang="ts">
const { user } = useUserSession()
const { data: tenants } = await useMyTenants()

const canOpen = (tenant: typeof tenants.value[number]) => canOpenTenant(tenant.status, user.value?.isPlatformAdmin)

// Skip the picker when there's only one tenant to choose
if (tenants.value.length === 1 && canOpen(tenants.value[0]!)) {
  await navigateTo(`/t/${tenants.value[0]!.slug}`, { replace: true })
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Insight"
      title="Your accounts"
      :description="tenants.length ? 'Choose the account you want to work in.' : undefined"
    />

    <section
      v-if="tenants.length"
      class="mt-10"
    >
      <SectionKicker
        number="01"
        label="Accounts"
        :count="`${tenants.length}`"
        class="mb-2"
      />
      <template
        v-for="tenant in tenants"
        :key="tenant.id"
      >
        <NuxtLink
          v-if="canOpen(tenant)"
          :to="`/t/${tenant.slug}`"
          class="group grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-muted py-[18px]"
        >
          <IconTile icon="i-lucide-building-2" />
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span class="truncate text-body-lg text-highlighted decoration-primary decoration-2 underline-offset-[5px] group-hover:underline">{{ tenant.name }}</span>
              <UBadge
                v-if="tenant.status !== 'active'"
                :label="TENANT_STATUS_LABELS[tenant.status]"
                :color="tenant.status === 'suspended' ? 'warning' : 'primary'"
                variant="subtle"
                size="sm"
              />
            </span>
            <span class="mono-meta mt-0.5 block truncate">{{ ROLE_LABELS[tenant.role] }}</span>
          </span>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4 text-muted transition-transform duration-[140ms] group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </NuxtLink>
        <div
          v-else
          class="grid grid-cols-[auto_1fr] items-center gap-4 border-b border-muted py-[18px]"
        >
          <IconTile icon="i-lucide-building-2" />
          <span class="min-w-0">
            <span class="flex items-center gap-2">
              <span class="truncate text-body-lg text-muted">{{ tenant.name }}</span>
              <UBadge
                :label="TENANT_STATUS_LABELS[tenant.status]"
                :color="tenant.status === 'suspended' ? 'warning' : 'primary'"
                variant="subtle"
                size="sm"
              />
            </span>
            <AsideNote class="mt-1">
              {{ tenant.status === 'setup'
                ? 'Answer United is getting this account ready. You’ll be able to open it soon.'
                : 'This account is suspended.' }}
            </AsideNote>
          </span>
        </div>
      </template>
    </section>

    <section
      v-else
      class="mt-10 flex flex-col items-start gap-4"
    >
      <p class="max-w-[520px] text-body-sm text-muted">
        {{ user?.isPlatformAdmin
          ? 'You are not a member of any account. Manage all accounts from the admin area.'
          : 'You are not a member of any account yet. Ask an account owner to invite you.' }}
      </p>
      <AsideNote>Nothing here yet.</AsideNote>
      <UButton
        v-if="user?.isPlatformAdmin"
        label="Manage accounts"
        icon="i-lucide-building-2"
        color="neutral"
        variant="outline"
        to="/admin/tenants"
      />
    </section>
  </div>
</template>

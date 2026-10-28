<script setup lang="ts">
// Parent route for everything under /t/[tenant]. The tenant and the user's role
// are loaded by middleware/tenant.global.ts and read through useTenant().
// Keyed by slug so switching tenants remounts the whole subtree with fresh data.
definePageMeta({ key: route => route.params.tenant as string })

const { tenant, context } = useTenant()
const { data: myTenants } = await useMyTenants()
const { user } = useUserSession()
const setTenantStatus = useTenantStatus()

// Only platform admins can be in here while the account is being set up
async function goLive() {
  if (tenant.value && await setTenantStatus(tenant.value, 'active')) {
    context.value = await $fetch<TenantContext>(`/api/me/tenants/${tenant.value.slug}`)
    await refreshNuxtData('my-tenants')
  }
}

// The rail has the account switcher on desktop; on mobile this chip links to the picker
const canSwitch = computed(() => myTenants.value.length > 1 || !!user.value?.isPlatformAdmin)
</script>

<template>
  <div>
    <div
      v-if="canSwitch"
      class="flex px-6 pt-4 sm:px-8 lg:hidden"
    >
      <UButton
        :label="tenant?.name"
        to="/"
        color="neutral"
        variant="outline"
        size="sm"
        trailing-icon="i-lucide-chevrons-up-down"
      />
    </div>
    <div
      v-if="tenant?.status === 'setup'"
      class="mx-auto w-full max-w-[1100px] px-6 pt-6 sm:px-8 lg:px-10"
    >
      <UAlert
        color="primary"
        variant="subtle"
        icon="i-lucide-wrench"
        title="This account is being set up"
        description="Customers can't open it until it goes live. Invitations can go out now."
        :actions="[{ label: 'Go live', icon: 'i-lucide-rocket', size: 'sm', onClick: goLive }]"
      />
    </div>
    <div
      v-if="tenant?.status === 'suspended'"
      class="mx-auto w-full max-w-[1100px] px-6 pt-6 sm:px-8 lg:px-10"
    >
      <UAlert
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="This account is suspended"
        description="Only Answer United administrators can access a suspended account."
      />
    </div>
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
// A card for settings only Answer United staff (platform admins) see. Tinted
// cobalt with a solid badge so it never reads as something the customer
// controls.
</script>

<template>
  <UCard
    :ui="{
      root: 'ring-cobalt-border divide-cobalt-border',
      header: 'bg-cobalt-bg py-4 sm:py-4'
    }"
  >
    <template #header>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <UBadge
          label="Answer United only"
          color="primary"
          variant="solid"
          icon="i-lucide-shield-check"
          class="font-med"
        />
        <p class="text-body-sm text-cobalt-text">
          Customers don’t see this section.
        </p>
      </div>
    </template>

    <slot />
  </UCard>
</template>

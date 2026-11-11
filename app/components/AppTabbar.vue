<script setup lang="ts">
import type { AppNavItem } from '~/composables/useAppNav'

const { tenantItems, adminItems, isActive } = useAppNav()

const stops = computed<AppNavItem[]>(() => [
  ...(tenantItems.value.length ? tenantItems.value : [{ icon: 'i-lucide-building-2', label: 'Accounts', to: '/', exact: true }]),
  ...adminItems.value,
  { icon: 'i-lucide-circle-user-round', label: 'Account', to: '/account' }
])

// Stops share the bar, up to 66px each, so a platform admin's extra items still fit a narrow phone
const stopWidth = computed(() => `min(66px, calc((100vw - 24px) / ${stops.value.length}))`)

const activeIndex = computed(() => stops.value.findIndex(isActive))

const inkWidth = computed(() => {
  const i = activeIndex.value
  return i === -1 ? '0px' : `calc((100% - 60px) * ${(i + 0.5) / stops.value.length})`
})
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-40 border-t border-muted bg-scrim pb-[env(safe-area-inset-bottom)] backdrop-blur-[16px] lg:hidden"
    aria-label="Primary"
  >
    <!-- Icons with a label under each: touch screens have no tooltips -->
    <div class="relative flex h-[76px] items-center justify-around px-3">
      <span
        class="pointer-events-none absolute left-[30px] right-[30px] top-[29px] h-[1.5px] bg-border"
        aria-hidden="true"
      />
      <span
        class="pointer-events-none absolute left-[30px] top-[29px] h-0.5 rounded-full bg-primary glow-primary transition-[width] duration-500 ease-ink"
        :style="{ width: inkWidth }"
        aria-hidden="true"
      />
      <NuxtLink
        v-for="(stop, i) in stops"
        :key="stop.to"
        :to="stop.to"
        class="relative flex min-h-11 flex-col items-center justify-center gap-1"
        :style="{ width: stopWidth }"
      >
        <span
          class="relative grid size-11 place-items-center rounded-subtle ring-1 transition-[color,background-color,transform] duration-[140ms] ease-ink"
          :class="i === activeIndex
            ? 'bg-rail-active text-primary ring-primary dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]'
            : 'bg-muted text-muted ring-muted'"
        >
          <UIcon
            :name="stop.icon"
            class="size-5"
          />
          <UIcon
            v-if="stop.locked"
            name="i-lucide-lock"
            class="absolute right-1 bottom-1 size-3 text-muted"
            aria-label="not in this account’s plan"
          />
        </span>
        <span
          class="max-w-full truncate text-[10.5px] leading-3 font-med"
          :class="i === activeIndex ? 'text-primary' : 'text-muted'"
        >{{ stop.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

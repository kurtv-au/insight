<script setup lang="ts">
import type { AppNavItem } from '~/composables/useAppNav'

const { tenantItems, adminItems, isActive } = useAppNav()

const stops = computed<AppNavItem[]>(() => [
  ...(tenantItems.value.length ? tenantItems.value : [{ icon: 'i-lucide-building-2', label: 'Accounts', to: '/', exact: true }]),
  ...adminItems.value,
  { icon: 'i-lucide-circle-user-round', label: 'Account', to: '/account' }
])

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
    <div class="relative flex h-16 items-center justify-around px-3">
      <span
        class="pointer-events-none absolute left-[30px] right-[30px] top-[26px] h-[1.5px] bg-border"
        aria-hidden="true"
      />
      <span
        class="pointer-events-none absolute left-[30px] top-[26px] h-0.5 rounded-full bg-primary glow-primary transition-[width] duration-500 ease-ink"
        :style="{ width: inkWidth }"
        aria-hidden="true"
      />
      <NuxtLink
        v-for="(stop, i) in stops"
        :key="stop.to"
        :to="stop.to"
        class="relative flex min-h-11 w-[min(66px,18vw)] flex-col items-center justify-center"
        :aria-label="stop.label"
      >
        <span
          class="grid size-11 place-items-center rounded-subtle bg-muted text-muted ring-1 ring-muted transition-[color,background-color,transform] duration-[140ms] ease-ink"
          :class="i === activeIndex && 'bg-rail-active text-primary shadow-[inset_0_2px_6px_rgba(0,0,0,0.25)] dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]'"
        >
          <UIcon
            :name="stop.icon"
            class="size-5"
          />
        </span>
      </NuxtLink>
    </div>
  </nav>
</template>

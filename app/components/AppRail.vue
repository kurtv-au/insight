<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AppNavItem } from '~/composables/useAppNav'

const { user } = useUserSession()
const { tenant } = useTenant()
const { data: myTenants } = await useMyTenants()
const { tenantItems, adminItems, isActive } = useAppNav()
const colorMode = useColorMode()
const signOut = useSignOut()

const switcherItems = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label' as const, label: 'Accounts' }],
  myTenants.value.map(t => ({
    label: t.name,
    description: t.status === 'active' ? undefined : TENANT_STATUS_LABELS[t.status],
    to: `/t/${t.slug}`,
    disabled: !canOpenTenant(t.status, user.value?.isPlatformAdmin),
    type: 'checkbox' as const,
    checked: t.id === tenant.value?.id
  })),
  user.value?.isPlatformAdmin ? [{ label: 'All tenants', icon: 'i-lucide-building-2', to: '/admin/tenants' }] : []
].filter(group => group.length > 0))

const accountMenu = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: user.value?.name || user.value?.email, description: user.value?.name ? user.value.email : undefined }],
  [
    { label: 'Account', icon: 'i-lucide-circle-user-round', to: '/account' },
    ...(user.value?.isPlatformAdmin ? [{ label: 'Admin', icon: 'i-lucide-shield', to: '/admin/tenants' }] : []),
    {
      label: colorMode.value === 'dark' ? 'Light mode' : 'Dark mode',
      icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => {
        colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
      }
    }
  ],
  [
    { label: 'Terms of Use', icon: 'i-lucide-scroll-text', to: '/terms' },
    { label: 'Privacy Policy', icon: 'i-lucide-lock', to: '/privacy' }
  ],
  [{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: signOut }]
])

const tileClass = 'relative grid size-11 place-items-center rounded-subtle border text-muted transition-[color,background-color,border-color,transform] duration-[140ms] ease-ink border-default bg-sidebar hover:border-accented hover:bg-rail-hover hover:text-default hover:-translate-y-px'
const activeClass = 'text-primary! bg-rail-active! border-default translate-y-0! shadow-[inset_0_2px_6px_rgba(0,0,0,0.12)] dark:shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]'

function itemClass(item: AppNavItem) {
  return [tileClass, isActive(item) && activeClass]
}
</script>

<template>
  <nav
    class="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center gap-1.5 border-r border-sidebar-border bg-sidebar pt-3.5 pb-4 lg:flex"
    aria-label="Primary"
  >
    <NuxtLink
      to="/"
      class="mb-2 grid h-[34px] w-11 place-items-center rounded-subtle transition-colors hover:bg-elevated"
      aria-label="Insight home"
    >
      <AppMark />
    </NuxtLink>

    <UDropdownMenu
      v-if="tenant || myTenants.length || user?.isPlatformAdmin"
      :items="switcherItems"
      :content="{ side: 'right', align: 'start', sideOffset: 8 }"
    >
      <button
        type="button"
        :class="tileClass"
        :aria-label="tenant ? `Account: ${tenant.name}. Switch account` : 'Choose an account'"
      >
        <span
          v-if="tenant"
          class="font-display text-[14px] font-heavy leading-none text-default"
        >{{ initials(tenant.name) }}</span>
        <UIcon
          v-else
          name="i-lucide-chevrons-up-down"
          class="size-[18px]"
        />
      </button>
    </UDropdownMenu>

    <div class="relative mt-3.5 flex flex-col items-center gap-2.5 pt-2.5">
      <UTooltip
        v-for="item in [...tenantItems, ...adminItems]"
        :key="item.to"
        :text="item.label"
        :content="{ side: 'right', sideOffset: 6 }"
        :delay-duration="0"
      >
        <NuxtLink
          :to="item.to"
          :class="itemClass(item)"
          :aria-label="item.label"
        >
          <UIcon
            :name="item.icon"
            class="size-[18px]"
          />
        </NuxtLink>
      </UTooltip>
    </div>

    <div class="mt-auto flex flex-col items-center gap-2.5">
      <UDropdownMenu
        :items="accountMenu"
        :content="{ side: 'right', align: 'end', sideOffset: 8 }"
      >
        <button
          type="button"
          class="mt-1 grid size-11 place-items-center rounded-full"
          aria-label="Your account"
        >
          <UAvatar
            :text="initials(user?.name || user?.email)"
            class="size-9 bg-avatar text-avatar-ink outline-offset-[1.5px] transition-[outline] hover:outline-[1.5px] hover:outline-primary"
            :ui="{ fallback: 'text-[15px] text-avatar-ink' }"
          />
        </button>
      </UDropdownMenu>
    </div>
  </nav>
</template>

<script setup lang="ts">
// "Received", when the message was taken, pinned above the selected fields. It
// isn't a script field: it can't be moved or removed, only shown as a default
// list column and as the message drawer's title. With both off it isn't shown
// anywhere, the CSV export included.
const setting = defineModel<MessageReceivedSetting>('setting', { required: true })

const placements = computed(() => [
  { key: 'showInList' as const, label: 'List', icon: 'i-lucide-rows-3', on: setting.value.showInList, hint: 'a default list column' },
  { key: 'showInDetail' as const, label: 'Detail', icon: 'i-lucide-panel-right', on: setting.value.showInDetail, hint: 'the message’s title' }
])
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-subtle border border-default bg-default py-1 pr-1.5 pl-1"
    :class="!receivedAvailable(setting) && 'opacity-70'"
  >
    <span
      class="grid size-8 shrink-0 place-items-center text-dimmed"
      aria-hidden="true"
    >
      <UIcon
        name="i-lucide-pin"
        class="size-4"
      />
    </span>
    <div class="flex min-w-48 flex-1 items-center gap-2 py-1">
      <span class="text-body-sm text-highlighted">Received</span>
      <span class="hidden truncate text-metadata text-muted sm:inline">When the message was taken</span>
      <UBadge
        v-if="!receivedAvailable(setting)"
        label="Hidden"
        color="neutral"
        variant="subtle"
        size="sm"
      />
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <UTooltip
        v-for="placement in placements"
        :key="placement.key"
        :text="placement.on ? `Shown as ${placement.hint}` : `Not shown as ${placement.hint}`"
      >
        <UButton
          :label="placement.label"
          :icon="placement.icon"
          :color="placement.on ? 'primary' : 'neutral'"
          :variant="placement.on ? 'soft' : 'ghost'"
          size="xs"
          :class="!placement.on && 'text-dimmed'"
          :aria-pressed="placement.on"
          :aria-label="`Show Received as ${placement.hint}`"
          @click="setting = { ...setting, [placement.key]: !placement.on }"
        />
      </UTooltip>
    </div>
  </div>
</template>

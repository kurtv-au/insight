<script setup lang="ts">
withDefaults(defineProps<{
  icon: string
  rounded?: 'standard' | 'full'
  tone?: 'elevated' | 'muted'
}>(), {
  rounded: 'standard',
  tone: 'elevated'
})
</script>

<template>
  <span
    class="inline-flex size-[42px] shrink-0 items-center justify-center text-default"
    :class="[
      rounded === 'full' ? 'rounded-full' : 'rounded-standard',
      tone === 'elevated' ? 'bg-elevated' : 'bg-muted'
    ]"
  >
    <UIcon
      :name="icon"
      class="size-[18px]"
    />
  </span>
</template>

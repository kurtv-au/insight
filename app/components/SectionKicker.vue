<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  number?: string
  count?: string
  hairline?: boolean
}>(), {
  number: undefined,
  count: undefined,
  hairline: true
})
</script>

<template>
  <div class="kicker flex items-baseline gap-3">
    <span
      v-if="number"
      class="text-cobalt-text"
    >{{ number }}</span>
    <span>{{ label }}</span>
    <span
      v-if="count"
      class="text-kicker-sm tracking-[0.1em]"
    >{{ count }}</span>
    <span
      v-if="hairline"
      class="hairline"
      aria-hidden="true"
    />
  </div>
</template>

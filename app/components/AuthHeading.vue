<script setup lang="ts">
defineProps<{
  kicker: string
  title: string
}>()
</script>

<template>
  <div>
    <SectionKicker :label="kicker" />
    <h1 class="mt-3 font-display text-[28px] leading-tight text-highlighted">
      {{ title }}
    </h1>
    <p
      v-if="$slots.default"
      class="mt-2 text-[15px] text-muted"
    >
      <slot />
    </p>
  </div>
</template>

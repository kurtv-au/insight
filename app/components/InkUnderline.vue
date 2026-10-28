<script setup lang="ts">
withDefaults(defineProps<{
  width?: number
}>(), {
  width: 190
})
</script>

<template>
  <svg
    :width="width"
    :height="width * 10 / 190"
    viewBox="0 0 190 10"
    fill="none"
    stroke="var(--ui-primary)"
    stroke-width="2.6"
    stroke-linecap="round"
    aria-hidden="true"
    preserveAspectRatio="none"
  >
    <path d="M2 6.5C30 3.5 60 2.5 95 3.5c36 1 66 2.5 93 3" />
  </svg>
</template>

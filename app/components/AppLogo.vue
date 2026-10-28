<script setup lang="ts">
// The full Answer United logo. The two files differ only in the "ANSWER" colour,
// so the swap is CSS-only and renders the same on the server and the client.
const props = withDefaults(defineProps<{
  width?: number
  label?: string
  align?: 'start' | 'center'
}>(), {
  width: 180,
  label: undefined,
  align: 'start'
})

const height = computed(() => Math.round(props.width * 170 / 595))
</script>

<template>
  <span
    class="inline-flex flex-col gap-2"
    :class="align === 'center' ? 'items-center' : 'items-start'"
  >
    <img
      src="/images/answer-logo-light-mode.png"
      alt="Answer United"
      :width="width"
      :height="height"
      class="dark:hidden"
    >
    <img
      src="/images/answer-logo-dark-mode.png"
      alt="Answer United"
      :width="width"
      :height="height"
      class="hidden dark:block"
    >
    <span
      v-if="label"
      class="kicker"
    >{{ label }}</span>
  </span>
</template>

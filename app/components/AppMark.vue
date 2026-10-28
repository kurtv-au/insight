<script setup lang="ts">
withDefaults(defineProps<{
  size?: number
}>(), {
  size: 28
})
</script>

<template>
  <!-- The AU square from the favicon. Decorative: the surrounding link carries the label. -->
  <img
    src="/apple-touch-icon.png"
    alt=""
    :width="size"
    :height="size"
    class="shrink-0 rounded-[7px]"
  >
</template>

<script setup lang="ts">
// A static, simplified picture of an Insight screen or email for the sign-in
// walkthrough. Decorative: the step text next to it says everything it shows.
defineProps<{ caption?: string }>()
</script>

<template>
  <figure
    class="pointer-events-none select-none break-inside-avoid"
    aria-hidden="true"
  >
    <div class="rounded-elevated border border-default bg-muted p-5 shadow-sm dark:bg-elevated/60">
      <slot />
    </div>
    <figcaption
      v-if="caption"
      class="mono-meta mt-2 text-center"
    >
      {{ caption }}
    </figcaption>
  </figure>
</template>

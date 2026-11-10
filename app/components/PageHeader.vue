<script setup lang="ts">
withDefaults(defineProps<{
  kicker: string
  title?: string
  description?: string
}>(), {
  title: undefined,
  description: undefined
})
</script>

<template>
  <header>
    <SectionKicker
      :label="kicker"
      :hairline="false"
    />
    <!-- On phones the actions go under the title, so they never cover it -->
    <div class="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div class="min-w-0">
        <h1 class="text-[clamp(32px,3.2vw,46px)] leading-[1.04] text-highlighted">
          {{ title }}
        </h1>
        <InkUnderline class="mt-2 block" />
      </div>
      <div
        v-if="$slots.actions"
        class="flex shrink-0 flex-wrap items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>
    <p
      v-if="description"
      class="mt-5 max-w-[640px] font-lead text-[17px] font-light leading-[1.6] text-muted"
    >
      {{ description }}
    </p>
  </header>
</template>

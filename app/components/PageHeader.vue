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
    <div class="mt-3 flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-[clamp(32px,3.2vw,46px)] leading-[1.04] text-highlighted">
          {{ title }}
        </h1>
        <InkUnderline class="mt-2 block" />
      </div>
      <div
        v-if="$slots.actions"
        class="flex shrink-0 items-center gap-2"
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

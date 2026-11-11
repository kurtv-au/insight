<script setup lang="ts">
/**
 * A feature the account's plan doesn't include: shown, locked, with the plan
 * that adds it and a way to ask for it. The server refuses it either way.
 */
const props = withDefaults(defineProps<{
  feature: PlanFeature
  /** Overrides the feature's name as the heading */
  title?: string
  /** One line, for inside a popover or next to a control */
  compact?: boolean
}>(), {
  title: undefined,
  compact: false
})

const { tenant } = useTenant()
const heading = computed(() => props.title ?? PLAN_FEATURES.find(info => info.key === props.feature)!.label)
const contactTo = computed(() => tenant.value ? `/support?account=${tenant.value.slug}` : '/support')
</script>

<template>
  <div
    v-if="compact"
    class="flex max-w-72 flex-col gap-1 text-body-sm"
  >
    <p class="flex items-center gap-1.5 font-medium text-highlighted">
      <UIcon
        name="i-lucide-lock"
        class="size-4 shrink-0"
      />
      {{ heading }}
    </p>
    <p class="text-muted">
      {{ upgradeHint(feature) }}.
      <NuxtLink
        :to="contactTo"
        class="text-default underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
      >Contact us to upgrade</NuxtLink>.
    </p>
  </div>
  <div
    v-else
    class="flex flex-col items-start gap-4 rounded-standard border border-default p-6"
  >
    <IconTile icon="i-lucide-lock" />
    <div>
      <p class="text-body-lg text-highlighted">
        {{ heading }}
      </p>
      <p class="mt-1 text-body-sm text-muted">
        {{ upgradeHint(feature) }}. {{ tenant ? `${tenant.name} is on the ${PLAN_LABELS[tenant.plan]} plan.` : '' }}
      </p>
    </div>
    <UButton
      label="Contact us to upgrade"
      icon="i-lucide-life-buoy"
      color="neutral"
      variant="outline"
      :to="contactTo"
    />
  </div>
</template>

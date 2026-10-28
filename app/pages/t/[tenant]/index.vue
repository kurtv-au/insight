<script setup lang="ts">
const { tenant } = useTenant()
useSeoMeta({ title: () => tenant.value?.name ?? 'Dashboard' })

const cards = [
  { title: 'Messages', icon: 'i-lucide-message-square', description: 'Messages taken on your behalf will appear here.' },
  { title: 'Call recordings', icon: 'i-lucide-audio-lines', description: 'Recordings of your calls will appear here.' }
]
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Dashboard"
      :title="tenant?.name"
      description="Your messages and call recordings, in one place."
    />

    <section class="mt-10">
      <SectionKicker
        number="01"
        label="Coming soon"
        class="mb-4"
      />
      <div class="grid gap-4 sm:grid-cols-2">
        <div
          v-for="card in cards"
          :key="card.title"
          class="flex items-start gap-4 rounded-standard border border-default bg-muted p-[22px]"
        >
          <IconTile :icon="card.icon" />
          <div class="min-w-0">
            <p class="font-display text-[19px] font-semi text-highlighted">
              {{ card.title }}
            </p>
            <p class="mt-1 text-body-sm text-muted">
              {{ card.description }}
            </p>
          </div>
        </div>
      </div>
      <AsideNote class="mt-6">
        We're building these now.
      </AsideNote>
    </section>
  </div>
</template>

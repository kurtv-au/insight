<script setup lang="ts">
const { tenant } = useTenant()
useSeoMeta({ title: () => tenant.value?.name ?? 'Dashboard' })
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Dashboard"
      :title="tenant?.name"
      description="Your messages and call recordings, in one place."
    />

    <section class="mt-10">
      <div class="grid gap-4 sm:grid-cols-2">
        <NuxtLink
          :to="`/t/${tenant?.slug}/recordings`"
          class="group flex items-start gap-4 rounded-standard border border-default bg-muted p-[22px] transition-colors hover:border-accented"
        >
          <IconTile icon="i-lucide-audio-lines" />
          <div class="min-w-0 flex-1">
            <p class="font-display text-[19px] font-semi text-highlighted decoration-primary decoration-2 underline-offset-[5px] group-hover:underline">
              Call recordings
            </p>
            <p class="mt-1 text-body-sm text-muted">
              Find a call and listen to it.
            </p>
          </div>
          <UIcon
            name="i-lucide-arrow-right"
            class="mt-1 size-4 text-muted transition-transform duration-[140ms] group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </NuxtLink>
        <div class="flex items-start gap-4 rounded-standard border border-default bg-muted p-[22px]">
          <IconTile icon="i-lucide-message-square" />
          <div class="min-w-0">
            <p class="font-display text-[19px] font-semi text-highlighted">
              Messages
            </p>
            <p class="mt-1 text-body-sm text-muted">
              Messages taken on your behalf will appear here.
            </p>
            <AsideNote class="mt-2">
              Coming soon.
            </AsideNote>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

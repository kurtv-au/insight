<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const notFound = computed(() => props.error.statusCode === 404)
// e.g. an account that is still being set up or is suspended
const forbidden = computed(() => props.error.statusCode === 403)

useSeoMeta({ title: () => notFound.value ? 'Not found' : 'Error' })
</script>

<template>
  <UApp>
    <div class="relative grid min-h-dvh place-items-center overflow-hidden bg-default px-6 py-16 text-default">
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-radial-[ellipse_60%_100%_at_50%_100%] from-cobalt-bg to-transparent"
        aria-hidden="true"
      />
      <div class="relative w-full max-w-[640px]">
        <AppLogo
          :width="160"
          label="Insight"
        />
        <SectionKicker
          :label="`Error ${error.statusCode}`"
          :hairline="false"
          class="mt-12"
        />
        <h1 class="mt-3 text-[clamp(32px,3.2vw,46px)] leading-[1.04] text-highlighted">
          {{ notFound ? 'Page not found' : forbidden ? 'Not available' : 'Something went wrong' }}
        </h1>
        <InkUnderline class="mt-2 block" />
        <p class="mt-5 font-lead text-[17px] font-light leading-[1.6] text-muted">
          {{ notFound ? 'This page doesn’t exist, or you don’t have access to it.' : (error.message || 'Please try again in a moment.') }}
        </p>
        <UButton
          label="Back to Insight"
          icon="i-lucide-arrow-left"
          class="mt-8"
          @click="clearError({ redirect: '/' })"
        />
      </div>
    </div>
  </UApp>
</template>

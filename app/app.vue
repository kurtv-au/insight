<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  titleTemplate: title => title && title !== 'Insight' ? `${title} · Insight` : 'Insight'
})

const description = 'The Answer United customer portal for accessing messages and call recordings.'

useSeoMeta({
  title: 'Insight',
  description,
  ogTitle: 'Insight',
  ogDescription: description
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>

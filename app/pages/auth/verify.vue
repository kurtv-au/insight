<script setup lang="ts">
// Landing page for emailed sign-in links. Requires a click so that email
// security scanners that follow links can't use up the one-time token.
definePageMeta({ layout: 'auth', auth: false })
useSeoMeta({ title: 'Sign in' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

const loading = ref(false)
const error = ref('')

async function signIn() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/email/verify', { method: 'POST', body: { token: token.value } })
    await refreshSession()
    await navigateTo('/')
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <AuthHeading
      kicker="sign in"
      title="One more click."
    >
      Continue to finish signing in. The link works once.
    </AuthHeading>

    <UAlert
      v-if="error || !token"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error || 'This sign-in link is incomplete.'"
    />

    <UButton
      v-if="token && !error"
      label="Continue to Insight"
      block
      class="h-11 text-[15px]"
      :loading="loading"
      @click="signIn"
    />

    <UButton
      v-else
      label="Back to sign in"
      to="/login"
      color="neutral"
      variant="outline"
      block
      class="h-11 text-[15px]"
    />
  </div>
</template>

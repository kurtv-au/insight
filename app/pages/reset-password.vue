<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', auth: false })
useSeoMeta({ title: 'Set a new password' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')

const schema = z.object({
  password: passwordSchema,
  confirm: z.string()
}).refine(data => data.password === data.confirm, { message: 'Passwords do not match', path: ['confirm'] })

const state = reactive({ password: '', confirm: '' })
const loading = ref(false)
const error = ref('')

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/password/reset', { method: 'POST', body: { token: token.value, password: event.data.password } })
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
      kicker="password"
      title="Set a new password."
    >
      Setting it signs you out on your other devices.
    </AuthHeading>

    <UAlert
      v-if="error || !token"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error || 'This reset link is incomplete.'"
    />

    <UForm
      v-if="token"
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="New password"
        name="password"
        help="At least 10 characters"
      >
        <UInput
          v-model="state.password"
          size="lg"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Confirm password"
        name="confirm"
      >
        <UInput
          v-model="state.confirm"
          size="lg"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Set password and sign in"
        block
        class="h-11 text-[15px]"
        :loading="loading"
      />
    </UForm>

    <UButton
      label="Back to sign in"
      to="/login"
      color="neutral"
      variant="link"
      block
      class="h-11 text-[15px]"
    />
  </div>
</template>

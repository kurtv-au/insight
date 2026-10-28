<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', auth: 'guest' })
useSeoMeta({ title: 'Reset password' })

const schema = z.object({ email: emailSchema })
const state = reactive({ email: '' })
const loading = ref(false)
const sent = ref(false)
const error = ref('')

async function onSubmit(event: FormSubmitEvent<z.output<typeof schema>>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/password/forgot', { method: 'POST', body: event.data })
    sent.value = true
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
      title="Reset your password."
    >
      {{ sent
        ? `If an account exists for ${state.email}, we sent a link to reset your password.`
        : 'Enter your email and we’ll send you a link to set a new password.' }}
    </AuthHeading>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <UForm
      v-if="!sent"
      :schema="schema"
      :state="state"
      class="space-y-4"
      @submit="onSubmit"
    >
      <UFormField
        label="Email"
        name="email"
      >
        <UInput
          v-model="state.email"
          size="lg"
          type="email"
          autocomplete="email"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Send reset link"
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

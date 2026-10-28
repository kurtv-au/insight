<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', auth: 'guest' })
useSeoMeta({ title: 'Sign in' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const { isSupported: passkeySupported, authenticate } = useWebAuthn()

const passwordSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
})

const state = reactive({ email: '', password: '' })
const step = ref<'credentials' | 'code'>('credentials')
const code = ref<string[]>([])
const loading = ref<'password' | 'email' | 'code' | 'passkey' | null>(null)
const error = ref('')

async function finishSignIn() {
  await refreshSession()
  await navigateTo(safeRedirect(route.query.redirect))
}

async function run(kind: NonNullable<typeof loading.value>, action: () => Promise<void>) {
  loading.value = kind
  error.value = ''
  try {
    await action()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = null
  }
}

function onPasswordSubmit(event: FormSubmitEvent<z.output<typeof passwordSchema>>) {
  return run('password', async () => {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await finishSignIn()
  })
}

function requestEmailLink() {
  const parsed = emailSchema.safeParse(state.email)
  if (!parsed.success) {
    error.value = 'Enter your email address first.'
    return
  }
  return run('email', async () => {
    await $fetch('/api/auth/email/request', { method: 'POST', body: { email: parsed.data } })
    code.value = []
    step.value = 'code'
  })
}

function verifyCode() {
  return run('code', async () => {
    await $fetch('/api/auth/email/verify', { method: 'POST', body: { email: state.email, code: code.value.join('') } })
    await finishSignIn()
  })
}

function signInWithPasskey() {
  return run('passkey', async () => {
    if (await authenticate()) {
      await finishSignIn()
    }
  })
}
</script>

<template>
  <div class="space-y-6">
    <AuthHeading
      v-if="step === 'code'"
      kicker="check your email"
      title="Enter your code."
    >
      If an account exists for <span class="text-default">{{ state.email }}</span>, we sent a sign-in link and a 6-digit code. Both work once and expire in 15 minutes.
    </AuthHeading>
    <AuthHeading
      v-else
      kicker="sign in"
      title="Welcome back."
    >
      Insight is invite only. Use the email your invitation was sent to.
    </AuthHeading>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <template v-if="step === 'credentials'">
      <UForm
        :schema="passwordSchema"
        :state="state"
        class="space-y-4"
        @submit="onPasswordSubmit"
      >
        <UFormField
          label="Email"
          name="email"
        >
          <UInput
            v-model="state.email"
            size="lg"
            type="email"
            autocomplete="username webauthn"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Password"
          name="password"
        >
          <template #hint>
            <ULink
              to="/forgot-password"
              class="text-[13px] text-cobalt-text"
            >
              Forgot password?
            </ULink>
          </template>
          <UInput
            v-model="state.password"
            size="lg"
            type="password"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Sign in"
          block
          class="h-11 text-[15px]"
          :loading="loading === 'password'"
        />
      </UForm>

      <div class="flex items-center gap-3">
        <span class="hairline" />
        <span class="mono-meta">or</span>
        <span class="hairline" />
      </div>

      <div class="space-y-2">
        <UButton
          label="Email me a sign-in link"
          icon="i-lucide-mail"
          color="neutral"
          variant="outline"
          block
          class="h-11 text-[15px]"
          :loading="loading === 'email'"
          @click="requestEmailLink"
        />
        <UButton
          v-if="passkeySupported"
          label="Sign in with a passkey"
          icon="i-lucide-key-round"
          color="neutral"
          variant="outline"
          block
          class="h-11 text-[15px]"
          :loading="loading === 'passkey'"
          @click="signInWithPasskey"
        />
      </div>
    </template>

    <template v-else>
      <form
        class="space-y-4"
        @submit.prevent="verifyCode"
      >
        <div class="flex justify-center">
          <UPinInput
            v-model="code"
            :length="6"
            otp
            autofocus
            @complete="verifyCode"
          />
        </div>
        <UButton
          type="submit"
          label="Sign in"
          block
          class="h-11 text-[15px]"
          :disabled="code.length < 6"
          :loading="loading === 'code'"
        />
      </form>

      <div class="flex justify-between">
        <UButton
          label="Use a different method"
          variant="link"
          color="neutral"
          class="px-0"
          @click="step = 'credentials'; error = ''"
        />
        <UButton
          label="Resend"
          variant="link"
          class="px-0"
          :loading="loading === 'email'"
          @click="requestEmailLink"
        />
      </div>
    </template>
  </div>
</template>

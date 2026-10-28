<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ layout: 'auth', auth: false })
useSeoMeta({ title: 'Accept invitation' })

const route = useRoute()
const token = route.params.token as string
const { loggedIn, user, fetch: refreshSession } = useUserSession()
const signOut = useSignOut()

const { data: invitation, error: loadError } = await useFetch(`/api/invitations/${token}`)

const schema = z.object({
  name: nameSchema,
  password: z.union([z.literal(''), passwordSchema])
})
const state = reactive({ name: '', password: '' })
const loading = ref(false)
const error = ref('')

const signedInAsInvitee = computed(() => loggedIn.value && user.value?.email === invitation.value?.email)

async function accept(body: { name?: string, password?: string } = {}) {
  loading.value = true
  error.value = ''
  try {
    const { tenantSlug, tenantStatus } = await $fetch(`/api/invitations/${token}/accept`, { method: 'POST', body })
    await refreshSession()
    clearNuxtData('my-tenants')
    // An account still being set up can't be opened yet; the picker explains why
    await navigateTo(canOpenTenant(tenantStatus, user.value?.isPlatformAdmin) ? `/t/${tenantSlug}` : '/')
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

function onCreateAccount(event: FormSubmitEvent<z.output<typeof schema>>) {
  return accept({ name: event.data.name, password: event.data.password || undefined })
}
</script>

<template>
  <div class="space-y-6">
    <template v-if="loadError || !invitation">
      <AuthHeading
        kicker="invitation"
        title="Invitation unavailable."
      />
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="errorMessage(loadError, 'This invitation is invalid or has expired.')"
      />
      <UButton
        label="Go to sign in"
        to="/login"
        color="neutral"
        variant="outline"
        block
        class="h-11 text-[15px]"
      />
    </template>

    <template v-else>
      <AuthHeading
        kicker="invitation"
        :title="`Join ${invitation.tenantName}.`"
      >
        You've been invited as {{ ROLE_LABELS[invitation.role].toLowerCase() }} with
        <span class="text-default">{{ invitation.email }}</span>.
      </AuthHeading>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :description="error"
      />

      <!-- Existing account: must be signed in as the invited email -->
      <template v-if="invitation.accountExists">
        <UButton
          v-if="signedInAsInvitee"
          label="Accept invitation"
          block
          class="h-11 text-[15px]"
          :loading="loading"
          @click="accept()"
        />
        <template v-else-if="loggedIn">
          <p class="text-body-sm text-muted">
            You're signed in as {{ user?.email }}. Sign out, then sign in as {{ invitation.email }} to accept.
          </p>
          <UButton
            label="Sign out"
            color="neutral"
            variant="outline"
            block
            class="h-11 text-[15px]"
            @click="signOut"
          />
        </template>
        <UButton
          v-else
          label="Sign in to accept"
          :to="{ path: '/login', query: { redirect: route.fullPath } }"
          block
          class="h-11 text-[15px]"
        />
      </template>

      <!-- New account -->
      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onCreateAccount"
      >
        <UFormField
          label="Your name"
          name="name"
        >
          <UInput
            v-model="state.name"
            size="lg"
            autocomplete="name"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Password"
          name="password"
          hint="Optional"
          help="Leave blank to sign in with email links or a passkey instead."
        >
          <UInput
            v-model="state.password"
            size="lg"
            type="password"
            autocomplete="new-password"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          label="Create account and join"
          block
          class="h-11 text-[15px]"
          :loading="loading"
        />
      </UForm>
    </template>
  </div>
</template>

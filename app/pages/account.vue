<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

useSeoMeta({ title: 'Account' })

const toast = useToast()
const confirm = useConfirm()
const { fetch: refreshSession } = useUserSession()
const { register, isSupported: passkeySupported } = useWebAuthn()

const { data: me, refresh: refreshMe } = await useFetch('/api/me')
const { data: passkeys, refresh: refreshPasskeys } = await useFetch('/api/me/passkeys', { default: () => [] })

// Profile
const profileSchema = z.object({ name: nameSchema })
const profile = reactive({ name: me.value?.name ?? '' })
const savingProfile = ref(false)

async function onSaveProfile(event: FormSubmitEvent<z.output<typeof profileSchema>>) {
  savingProfile.value = true
  try {
    await $fetch('/api/me', { method: 'PATCH', body: event.data })
    await Promise.all([refreshSession(), refreshMe()])
    toast.add({ title: 'Profile updated', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

// Password
const passwordFormSchema = computed(() => z.object({
  currentPassword: me.value?.hasPassword ? z.string().min(1, 'Current password is required') : z.string(),
  newPassword: passwordSchema,
  confirm: z.string()
}).refine(data => data.newPassword === data.confirm, { message: 'Passwords do not match', path: ['confirm'] }))
const password = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const savingPassword = ref(false)

async function onSavePassword() {
  savingPassword.value = true
  try {
    await $fetch('/api/me/password', {
      method: 'POST',
      body: { currentPassword: password.currentPassword || undefined, newPassword: password.newPassword }
    })
    Object.assign(password, { currentPassword: '', newPassword: '', confirm: '' })
    await refreshMe()
    toast.add({ title: 'Password saved', description: 'Other devices have been signed out.', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingPassword.value = false
  }
}

// Passkeys
const newPasskeyName = ref('')
const addingPasskey = ref(false)

async function addPasskey() {
  if (!me.value) {
    return
  }
  addingPasskey.value = true
  try {
    // The server registers the passkey to the signed-in user regardless of userName
    await register({
      userName: me.value.email,
      displayName: me.value.name || me.value.email,
      passkeyName: newPasskeyName.value.trim() || 'Passkey'
    })
    newPasskeyName.value = ''
    await refreshPasskeys()
    toast.add({ title: 'Passkey added', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err, 'The passkey was not added.'), color: 'error' })
  } finally {
    addingPasskey.value = false
  }
}

const editingPasskeyId = ref<string | null>(null)
const editingName = ref('')

async function renamePasskey(id: string) {
  const parsed = nameSchema.safeParse(editingName.value)
  if (!parsed.success) {
    return
  }
  try {
    await $fetch(`/api/me/passkeys/${encodeURIComponent(id)}`, { method: 'PATCH', body: { name: parsed.data } })
    editingPasskeyId.value = null
    await refreshPasskeys()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function removePasskey(passkey: { id: string, name: string }) {
  const confirmed = await confirm({
    title: `Remove "${passkey.name}"?`,
    description: 'You will no longer be able to sign in with this passkey.',
    confirmLabel: 'Remove'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`/api/me/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' })
    await refreshPasskeys()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

// Sessions
async function signOutOtherDevices() {
  const confirmed = await confirm({
    title: 'Sign out of all other devices?',
    description: 'You will stay signed in on this device.',
    confirmLabel: 'Sign out others'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch('/api/me/sessions', { method: 'DELETE' })
    toast.add({ title: 'Signed out of all other devices', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[860px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Account"
      :title="me?.name || 'Your account'"
      description="Manage your profile and how you sign in."
    />

    <section class="mt-10">
      <SectionKicker
        number="01"
        label="Profile"
        class="mb-3"
      />
      <UCard>
        <UForm
          :schema="profileSchema"
          :state="profile"
          class="space-y-4"
          @submit="onSaveProfile"
        >
          <UFormField
            label="Email"
            help="Contact Answer United to change your email address."
          >
            <UInput
              :model-value="me?.email"
              disabled
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Name"
            name="name"
          >
            <UInput
              v-model="profile.name"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Save"
            :loading="savingProfile"
          />
        </UForm>
      </UCard>
    </section>

    <section class="mt-10">
      <SectionKicker
        number="02"
        label="Password"
        class="mb-3"
      />
      <UCard>
        <template #header>
          <p class="text-body-sm text-muted">
            {{ me?.hasPassword
              ? 'Changing your password signs you out of other devices.'
              : 'You don’t have a password yet. You can sign in with email links or passkeys, or set one here.' }}
          </p>
        </template>
        <UForm
          :schema="passwordFormSchema"
          :state="password"
          class="space-y-4"
          @submit="onSavePassword"
        >
          <UFormField
            v-if="me?.hasPassword"
            label="Current password"
            name="currentPassword"
          >
            <UInput
              v-model="password.currentPassword"
              type="password"
              autocomplete="current-password"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="New password"
            name="newPassword"
            help="At least 10 characters"
          >
            <UInput
              v-model="password.newPassword"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Confirm new password"
            name="confirm"
          >
            <UInput
              v-model="password.confirm"
              type="password"
              autocomplete="new-password"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            :label="me?.hasPassword ? 'Change password' : 'Set password'"
            :loading="savingPassword"
          />
        </UForm>
      </UCard>
    </section>

    <section class="mt-10">
      <SectionKicker
        number="03"
        label="Passkeys"
        :count="passkeys.length ? `${passkeys.length}` : undefined"
        class="mb-3"
      />
      <UCard>
        <template #header>
          <p class="text-body-sm text-muted">
            Sign in with your fingerprint, face, or device PIN instead of a password.
          </p>
        </template>

        <ul
          v-if="passkeys.length"
          class="divide-y divide-muted"
        >
          <li
            v-for="passkey in passkeys"
            :key="passkey.id"
            class="flex items-center justify-between gap-4 py-3 first:pt-0"
          >
            <div
              v-if="editingPasskeyId === passkey.id"
              class="flex flex-1 gap-2"
            >
              <UInput
                v-model="editingName"
                class="flex-1"
                autofocus
                @keydown.enter="renamePasskey(passkey.id)"
              />
              <UButton
                label="Save"
                size="sm"
                @click="renamePasskey(passkey.id)"
              />
              <UButton
                label="Cancel"
                size="sm"
                color="neutral"
                variant="ghost"
                @click="editingPasskeyId = null"
              />
            </div>
            <template v-else>
              <div class="flex min-w-0 items-center gap-3">
                <UAvatar
                  icon="i-lucide-key-round"
                  class="bg-elevated"
                  :ui="{ icon: 'text-default' }"
                />
                <div class="min-w-0">
                  <p class="truncate text-body-sm text-highlighted">
                    {{ passkey.name }}
                  </p>
                  <p class="mono-meta truncate">
                    Added {{ formatDate(passkey.createdAt) }} · Last used {{ formatDate(passkey.lastUsedAt) }}
                  </p>
                </div>
              </div>
              <div class="flex gap-1">
                <UButton
                  label="Rename"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  @click="editingPasskeyId = passkey.id; editingName = passkey.name"
                />
                <UButton
                  label="Remove"
                  size="sm"
                  color="error"
                  variant="ghost"
                  @click="removePasskey(passkey)"
                />
              </div>
            </template>
          </li>
        </ul>
        <p
          v-else
          class="text-body-sm text-muted"
        >
          No passkeys yet.
        </p>

        <template #footer>
          <div
            v-if="passkeySupported"
            class="flex gap-2"
          >
            <UInput
              v-model="newPasskeyName"
              placeholder="Passkey name, e.g. Work laptop"
              class="flex-1"
            />
            <UButton
              label="Add passkey"
              icon="i-lucide-key-round"
              :loading="addingPasskey"
              @click="addPasskey"
            />
          </div>
          <p
            v-else
            class="text-body-sm text-muted"
          >
            This browser doesn't support passkeys.
          </p>
        </template>
      </UCard>
    </section>

    <section class="mt-10">
      <SectionKicker
        number="04"
        label="Sessions"
        class="mb-3"
      />
      <UCard>
        <div class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-body-sm text-muted">
            Signed in somewhere you don't recognize? Sign out everywhere except this device.
          </p>
          <UButton
            label="Sign out other devices"
            color="neutral"
            variant="outline"
            @click="signOutOtherDevices"
          />
        </div>
      </UCard>
    </section>

    <LegalLinks class="mt-12" />
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'Platform admins' })

const { user } = useUserSession()
const { formatDateTime } = useTimezone()
const toast = useToast()
const confirm = useConfirm()

const { data: admins, refresh } = await useFetch('/api/admin/admins', { default: () => [] })
type Admin = typeof admins.value[number]

function adminActions(admin: Admin): DropdownMenuItem[] {
  return [{
    label: 'Remove admin',
    icon: 'i-lucide-shield-off',
    color: 'error',
    onSelect: () => removeAdmin(admin)
  }]
}

async function removeAdmin(admin: Admin) {
  const who = admin.name || admin.email
  const confirmed = await confirm({
    title: `Remove ${who} as an admin?`,
    description: 'They’ll lose access to every account they aren’t a member of. Their own account memberships stay.',
    confirmLabel: 'Remove admin'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`/api/admin/admins/${admin.id}`, { method: 'DELETE' })
    toast.add({ title: `${who} is no longer an admin`, color: 'success' })
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

const addOpen = ref(false)
const addSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(255).optional(),
  notify: z.boolean()
})
const addState = reactive({ email: '', name: '', notify: true })
const adding = ref(false)

async function onAdd(event: FormSubmitEvent<z.output<typeof addSchema>>) {
  adding.value = true
  try {
    const result = await $fetch('/api/admin/admins', { method: 'POST', body: { ...event.data, name: event.data.name || undefined } })
    const who = event.data.name || event.data.email
    if (event.data.notify && !result.emailed) {
      toast.add({ title: `${who} is now an admin`, description: 'The email couldn’t be sent. Let them know to sign in with “Email me a sign-in link”.', color: 'warning' })
    } else {
      toast.add({ title: `${who} is now an admin`, description: event.data.notify ? 'We emailed them how to sign in.' : undefined, color: 'success' })
    }
    addOpen.value = false
    addState.email = ''
    addState.name = ''
    addState.notify = true
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Admin"
      title="Platform admins"
      description="Answer United staff who can set up and open every account."
    >
      <template #actions>
        <UButton
          label="Add admin"
          icon="i-lucide-user-plus"
          @click="addOpen = true"
        />
      </template>
    </PageHeader>

    <section class="mt-10">
      <SectionKicker
        number="01"
        label="Admins"
        :count="`${admins.length}`"
        class="mb-3"
      />
      <div class="divide-y divide-muted rounded-standard border border-default">
        <div
          v-for="admin in admins"
          :key="admin.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UAvatar
            :text="initials(admin.name || admin.email)"
            class="hidden bg-avatar sm:inline-flex"
            :ui="{ fallback: 'text-avatar-ink' }"
          />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-body-sm text-highlighted">
              <span class="truncate">{{ admin.name || admin.email }}</span>
              <UBadge
                v-if="admin.id === user?.id"
                label="You"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </p>
            <p class="mono-meta truncate">
              <template v-if="admin.name">
                {{ admin.email }} ·
              </template>
              {{ admin.lastLoginAt ? `last sign-in ${formatDateTime(admin.lastLoginAt)}` : 'hasn’t signed in yet' }}
            </p>
          </div>
          <UDropdownMenu
            v-if="admin.id !== user?.id"
            :items="adminActions(admin)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Actions for ${admin.name || admin.email}`"
            />
          </UDropdownMenu>
          <span
            v-else
            class="size-[30px]"
          />
        </div>
      </div>
      <AsideNote class="mt-3">
        Admins can’t remove themselves, so there’s always at least one.
      </AsideNote>
    </section>

    <UModal
      v-model:open="addOpen"
      title="Add a platform admin"
      description="They’ll be able to set up and open every account. If they don’t have an Insight sign-in yet, one is created; they sign in with an emailed link."
    >
      <template #body>
        <UForm
          id="add-admin-form"
          :schema="addSchema"
          :state="addState"
          class="space-y-4"
          @submit="onAdd"
        >
          <UFormField
            label="Email"
            name="email"
          >
            <UInput
              v-model="addState.email"
              type="email"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Name"
            name="name"
            hint="Optional"
            help="Used only if they don’t already have one."
          >
            <UInput
              v-model="addState.name"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-model="addState.notify"
            name="notify"
            label="Email them how to sign in"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="addOpen = false"
          />
          <UButton
            type="submit"
            form="add-admin-form"
            label="Add admin"
            :loading="adding"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

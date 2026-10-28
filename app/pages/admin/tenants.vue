<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

definePageMeta({ middleware: 'admin' })
useSeoMeta({ title: 'All accounts' })

const toast = useToast()
const setTenantStatus = useTenantStatus()

const { data: tenants, refresh } = await useFetch('/api/admin/tenants', { default: () => [] })
type Tenant = typeof tenants.value[number]

async function setStatus(tenant: Tenant, status: TenantStatus) {
  if (await setTenantStatus(tenant, status)) {
    await refresh()
  }
}

const STATUS_ACTIONS: Record<TenantStatus, (tenant: Tenant) => DropdownMenuItem> = {
  setup: tenant => ({ label: 'Go live', icon: 'i-lucide-rocket', onSelect: () => setStatus(tenant, 'active') }),
  active: tenant => ({ label: 'Suspend', icon: 'i-lucide-pause', color: 'warning', onSelect: () => setStatus(tenant, 'suspended') }),
  suspended: tenant => ({ label: 'Reactivate', icon: 'i-lucide-play', onSelect: () => setStatus(tenant, 'active') })
}

function tenantActions(tenant: Tenant): DropdownMenuItem[] {
  return [
    { label: 'Open', icon: 'i-lucide-arrow-right', to: `/t/${tenant.slug}` },
    ...(tenant.ownerCount === 0
      ? [{ label: tenant.pendingOwnerInvites ? 'Resend owner invite' : 'Invite owner', icon: 'i-lucide-user-plus', onSelect: () => openInviteOwner(tenant) }]
      : []),
    STATUS_ACTIONS[tenant.status](tenant)
  ]
}

// Owner badge, shown until the account has an owner
function ownerBadge(tenant: Tenant) {
  if (tenant.ownerCount > 0) {
    return null
  }
  return tenant.pendingOwnerInvites ? 'Owner invited' : 'No owner yet'
}

// Create
const createOpen = ref(false)
// The owner can be invited now or later, once the account is configured
const createSchema = z.object({ name: nameSchema, slug: slugSchema, ownerEmail: z.literal('').or(emailSchema) })
const createState = reactive({ name: '', slug: '', ownerEmail: '' })
const slugEdited = ref(false)
const creating = ref(false)

function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

watch(() => createState.name, (name) => {
  if (!slugEdited.value) {
    createState.slug = toSlug(name)
  }
})

async function onCreate(event: FormSubmitEvent<z.output<typeof createSchema>>) {
  creating.value = true
  try {
    const { ownerEmail, ...rest } = event.data
    await $fetch('/api/admin/tenants', { method: 'POST', body: { ...rest, ownerEmail: ownerEmail || undefined } })
    toast.add({
      title: `${event.data.name} created`,
      description: ownerEmail ? `Owner invitation sent to ${ownerEmail}.` : 'It stays in setup until you take it live.',
      color: 'success'
    })
    createOpen.value = false
    Object.assign(createState, { name: '', slug: '', ownerEmail: '' })
    slugEdited.value = false
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    creating.value = false
  }
}

// Invite owner (for accounts created without one)
const inviteTenant = ref<Tenant | null>(null)
const inviteOpen = computed({
  get: () => !!inviteTenant.value,
  set: (open) => {
    if (!open) {
      inviteTenant.value = null
    }
  }
})
const inviteSchema = z.object({ email: emailSchema })
const inviteState = reactive({ email: '' })
const inviting = ref(false)

function openInviteOwner(tenant: Tenant) {
  inviteState.email = ''
  inviteTenant.value = tenant
}

async function onInviteOwner(event: FormSubmitEvent<z.output<typeof inviteSchema>>) {
  const tenant = inviteTenant.value
  if (!tenant) {
    return
  }
  inviting.value = true
  try {
    await $fetch(`/api/tenants/${tenant.id}/invitations`, { method: 'POST', body: { email: event.data.email, role: 'owner' } })
    toast.add({ title: `Owner invitation sent to ${event.data.email}`, color: 'success' })
    inviteTenant.value = null
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    inviting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Admin"
      title="All accounts"
      description="Every customer account (tenant) in Insight. New accounts stay in setup, closed to customers, until you take them live."
    >
      <template #actions>
        <UButton
          label="New account"
          icon="i-lucide-plus"
          @click="createOpen = true"
        />
      </template>
    </PageHeader>

    <section class="mt-10">
      <SectionKicker
        number="01"
        label="Accounts"
        :count="tenants.length ? `${tenants.length}` : undefined"
        class="mb-3"
      />
      <div
        v-if="tenants.length"
        class="divide-y divide-muted rounded-standard border border-default"
      >
        <div
          v-for="tenant in tenants"
          :key="tenant.id"
          class="flex items-center gap-3 px-4 py-3"
        >
          <UAvatar
            icon="i-lucide-building-2"
            class="bg-elevated"
            :ui="{ icon: 'text-default' }"
          />
          <div class="min-w-0 flex-1">
            <p class="flex flex-wrap items-center gap-2 text-body-sm text-highlighted">
              <NuxtLink
                :to="`/t/${tenant.slug}`"
                class="truncate decoration-primary decoration-2 underline-offset-[5px] hover:underline"
              >{{ tenant.name }}</NuxtLink>
              <UBadge
                v-if="tenant.status !== 'active'"
                :label="TENANT_STATUS_LABELS[tenant.status]"
                :color="tenant.status === 'suspended' ? 'warning' : 'primary'"
                variant="subtle"
                size="sm"
              />
              <UBadge
                v-if="ownerBadge(tenant)"
                :label="ownerBadge(tenant)!"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </p>
            <p class="mono-meta truncate">
              /t/{{ tenant.slug }} · {{ tenant.memberCount }} {{ tenant.memberCount === 1 ? 'member' : 'members' }} · created {{ formatDate(tenant.createdAt) }}
            </p>
          </div>
          <UDropdownMenu
            :items="tenantActions(tenant)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="`Actions for ${tenant.name}`"
            />
          </UDropdownMenu>
        </div>
      </div>
      <div
        v-else
        class="flex flex-col items-start gap-4"
      >
        <p class="text-body-sm text-muted">
          No accounts yet.
        </p>
        <AsideNote>Start by creating the first customer account.</AsideNote>
      </div>
    </section>

    <UModal
      v-model:open="createOpen"
      title="New account"
    >
      <template #body>
        <UForm
          id="create-tenant-form"
          :schema="createSchema"
          :state="createState"
          class="space-y-4"
          @submit="onCreate"
        >
          <UFormField
            label="Account name"
            name="name"
          >
            <UInput
              v-model="createState.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="URL slug"
            name="slug"
            :help="`insight/t/${createState.slug || 'acme'}`"
          >
            <UInput
              v-model="createState.slug"
              class="w-full"
              @update:model-value="slugEdited = true"
            />
          </UFormField>
          <UFormField
            label="Owner email"
            name="ownerEmail"
            help="Optional. Invite the owner now, or later once the account is configured."
          >
            <UInput
              v-model="createState.ownerEmail"
              type="email"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="createOpen = false"
          />
          <UButton
            type="submit"
            form="create-tenant-form"
            :label="createState.ownerEmail ? 'Create and invite owner' : 'Create account'"
            :loading="creating"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="inviteOpen"
      title="Invite owner"
      :description="inviteTenant ? `We'll email an invitation to become the owner of ${inviteTenant.name}.` : undefined"
    >
      <template #body>
        <UForm
          id="invite-owner-form"
          :schema="inviteSchema"
          :state="inviteState"
          class="space-y-4"
          @submit="onInviteOwner"
        >
          <UFormField
            label="Owner email"
            name="email"
            :help="inviteTenant?.status === 'setup' ? 'They can accept now, but can’t open the account until it goes live.' : undefined"
          >
            <UInput
              v-model="inviteState.email"
              type="email"
              class="w-full"
            />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="inviteOpen = false"
          />
          <UButton
            type="submit"
            form="invite-owner-form"
            label="Send invitation"
            :loading="inviting"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

const { user } = useUserSession()
const { tenant, role: myRole, can } = useTenant()
const { formatDate, formatDateTime } = useTimezone()
const toast = useToast()
const confirm = useConfirm()
useSeoMeta({ title: 'Members' })

// The parent route remounts this page when the tenant changes, so the ID is fixed
const apiBase = `/api/tenants/${tenant.value!.id}` as const

const { data: members, refresh: refreshMembers } = await useFetch(`${apiBase}/members`, {
  immediate: can('admin'),
  default: () => []
})
const { data: invitations, refresh: refreshInvitations } = await useFetch(`${apiBase}/invitations`, {
  immediate: can('admin'),
  default: () => []
})

const { data: filterData, refresh: refreshFilters } = await useFetch(`${apiBase}/message-filters`, {
  immediate: can('admin'),
  default: () => ({ filters: [] as MessageFilterDto[], fields: [] })
})

type Member = typeof members.value[number]
type Invitation = typeof invitations.value[number]

// Message filters: a member with any sees only messages matching one of them
const filtersById = computed(() => new Map(filterData.value.filters.map(filter => [filter.id, filter])))
function filterNames(member: Member) {
  return member.filterIds
    .map(id => filtersById.value.get(id)?.name)
    .filter((name): name is string => !!name)
    .sort((a, b) => a.localeCompare(b))
}
// Someone else has to change your filters, unless you're a platform admin.
// Only viewers can have filters; anyone else is offered them only to clear any
// left over from before that rule.
function canFilter(member: Member) {
  return canManage(member)
    && (member.userId !== user.value?.id || !!user.value?.isPlatformAdmin)
    && (member.role === 'viewer' || member.filterIds.length > 0)
}
const fieldLabels = computed(() => new Map(filterData.value.fields.map(field => [canonicalFieldKey(field.fieldKey), field.label])))
const filterItems = computed(() => filterData.value.filters.map(filter => ({
  label: filter.name,
  value: filter.id,
  description: `${fieldLabels.value.get(canonicalFieldKey(filter.fieldKey)) ?? filter.fieldKey} = ${filter.value}`
})))

const filtersOpen = ref(false)
const filtersMember = ref<Member | null>(null)
const chosenFilters = ref<string[]>([])
const savingFilters = ref(false)

function openFilters(member: Member) {
  filtersMember.value = member
  chosenFilters.value = [...member.filterIds]
  filtersOpen.value = true
}

async function saveFilters() {
  const member = filtersMember.value
  if (!member) {
    return
  }
  const who = member.name || member.email
  if (!chosenFilters.value.length && member.filterIds.length) {
    const confirmed = await confirm({
      title: `Remove all of ${who}’s filters?`,
      description: 'They’ll see every message in this account.',
      confirmLabel: 'Remove filters'
    })
    if (!confirmed) {
      return
    }
  }
  savingFilters.value = true
  try {
    await $fetch(`${apiBase}/members/${member.userId}/message-filters`, { method: 'PUT', body: { filterIds: chosenFilters.value } })
    toast.add({ title: `${who}’s message filters saved`, color: 'success' })
    filtersOpen.value = false
    await Promise.all([refreshMembers(), refreshFilters()])
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingFilters.value = false
  }
}

// Mirrors the server rules; the server still enforces them
function canManage(member: Member) {
  return member.role !== 'owner' || myRole.value === 'owner'
}
const roleItems = computed(() => ROLES
  .filter(role => role !== 'owner' || myRole.value === 'owner')
  .map(role => ({ label: ROLE_LABELS[role], value: role })))
// A filtered member stays a viewer: admins and owners manage filters, so a
// filter wouldn't hold them
function memberRoleItems(member: Member) {
  return member.filterIds.length
    ? roleItems.value.map(item => ({ ...item, disabled: item.value !== 'viewer' }))
    : roleItems.value
}

async function changeRole(member: Member, role: Role) {
  if (role === member.role) {
    return
  }
  try {
    await $fetch(`${apiBase}/members/${member.userId}`, { method: 'PATCH', body: { role } })
    toast.add({ title: `${member.name || member.email} is now ${ROLE_LABELS[role].toLowerCase()}`, color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
  await refreshMembers()
}

async function removeMember(member: Member) {
  const isSelf = member.userId === user.value?.id
  const confirmed = await confirm({
    title: isSelf ? 'Leave this account?' : `Remove ${member.name || member.email}?`,
    description: isSelf ? 'You will lose access to this account.' : 'They will lose access to this account.',
    confirmLabel: isSelf ? 'Leave' : 'Remove'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`${apiBase}/members/${member.userId}`, { method: 'DELETE' })
    if (isSelf) {
      clearNuxtData('my-tenants')
      await navigateTo('/')
      return
    }
    await refreshMembers()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

async function revokeInvitation(invitation: Invitation) {
  try {
    await $fetch(`${apiBase}/invitations/${invitation.id}`, { method: 'DELETE' })
    await refreshInvitations()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

function memberActions(member: Member): DropdownMenuItem[][] {
  const isSelf = member.userId === user.value?.id
  const remove: DropdownMenuItem = {
    label: isSelf ? 'Leave account' : 'Remove from account',
    icon: isSelf ? 'i-lucide-log-out' : 'i-lucide-user-minus',
    color: 'error',
    onSelect: () => removeMember(member)
  }
  if (!canFilter(member)) {
    return [[remove]]
  }
  return [[{ label: 'Message filters…', icon: 'i-lucide-filter', onSelect: () => openFilters(member) }], [remove]]
}

const inviteOpen = ref(false)
const inviteSchema = z.object({ email: emailSchema, role: roleSchema })
const inviteState = reactive<{ email: string, role: Role }>({ email: '', role: 'viewer' })
const inviting = ref(false)

async function onInvite(event: FormSubmitEvent<z.output<typeof inviteSchema>>) {
  inviting.value = true
  try {
    await $fetch(`${apiBase}/invitations`, { method: 'POST', body: event.data })
    toast.add({ title: `Invitation sent to ${event.data.email}`, color: 'success' })
    inviteOpen.value = false
    inviteState.email = ''
    inviteState.role = 'viewer'
    await refreshInvitations()
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
      :kicker="tenant?.name ?? 'Account'"
      title="Members"
      :description="`People with access to ${tenant?.name}, and what they can do.`"
    >
      <template
        v-if="can('admin')"
        #actions
      >
        <UButton
          label="Invite member"
          icon="i-lucide-user-plus"
          @click="inviteOpen = true"
        />
      </template>
    </PageHeader>

    <UAlert
      v-if="!can('admin')"
      class="mt-10"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      description="Only owners and admins can manage members."
    />

    <template v-else>
      <section class="mt-10">
        <SectionKicker
          number="01"
          label="Members"
          :count="`${members.length}`"
          class="mb-3"
        />
        <div class="divide-y divide-muted rounded-standard border border-default">
          <div
            v-for="member in members"
            :key="member.userId"
            class="flex items-center gap-3 px-4 py-3"
          >
            <UAvatar
              :text="initials(member.name || member.email)"
              class="hidden bg-avatar sm:inline-flex"
              :ui="{ fallback: 'text-avatar-ink' }"
            />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 text-body-sm text-highlighted">
                <span class="truncate">{{ member.name || member.email }}</span>
                <UBadge
                  v-if="member.userId === user?.id"
                  label="You"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </p>
              <p class="mono-meta truncate">
                <template v-if="member.name">
                  {{ member.email }} ·
                </template>
                last sign-in {{ formatDateTime(member.lastLoginAt) }}
              </p>
              <p
                v-if="member.filterIds.length"
                class="mt-1 flex flex-wrap items-center gap-1"
              >
                <span class="sr-only">Sees messages matching:</span>
                <UIcon
                  name="i-lucide-filter"
                  class="size-3.5 text-muted"
                  aria-hidden="true"
                />
                <UBadge
                  v-for="name in filterNames(member)"
                  :key="name"
                  :label="name"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </p>
            </div>
            <USelect
              v-if="canManage(member)"
              :model-value="member.role"
              :items="memberRoleItems(member)"
              variant="outline"
              size="sm"
              class="w-24 sm:w-28"
              :aria-label="`Role for ${member.name || member.email}`"
              @update:model-value="role => changeRole(member, role as Role)"
            />
            <UBadge
              v-else
              :label="ROLE_LABELS[member.role]"
              color="neutral"
              variant="outline"
            />
            <UDropdownMenu
              v-if="canManage(member) || member.userId === user?.id"
              :items="memberActions(member)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Actions for ${member.name || member.email}`"
              />
            </UDropdownMenu>
            <span
              v-else
              class="size-[30px]"
            />
          </div>
        </div>
      </section>

      <section class="mt-10">
        <SectionKicker
          number="02"
          label="Pending invitations"
          :count="invitations.length ? `${invitations.length}` : undefined"
          class="mb-3"
        />
        <div
          v-if="invitations.length"
          class="divide-y divide-muted rounded-standard border border-default"
        >
          <div
            v-for="invitation in invitations"
            :key="invitation.id"
            class="flex items-center gap-3 px-4 py-3"
          >
            <UAvatar
              icon="i-lucide-mail"
              class="bg-elevated"
              :ui="{ icon: 'text-default' }"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-body-sm text-highlighted">
                {{ invitation.email }}
              </p>
              <p class="mono-meta truncate">
                {{ ROLE_LABELS[invitation.role] }} · expires {{ formatDate(invitation.expiresAt) }}
              </p>
            </div>
            <UButton
              label="Revoke"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="revokeInvitation(invitation)"
            />
          </div>
        </div>
        <p
          v-else
          class="text-body-sm text-muted"
        >
          No pending invitations.
        </p>
      </section>
    </template>
    <UModal
      v-model:open="filtersOpen"
      :title="`Message filters for ${filtersMember?.name || filtersMember?.email}`"
      description="They see only messages where one of these filters matches. With none, they see every message."
    >
      <template #body>
        <AsideNote
          v-if="filtersMember && filtersMember.role !== 'viewer'"
          class="mb-4"
        >
          Message filters apply only to viewers. Remove these, or make {{ filtersMember.name || filtersMember.email }} a viewer to keep them.
        </AsideNote>
        <USelectMenu
          v-if="filterItems.length"
          v-model="chosenFilters"
          :items="filterItems"
          value-key="value"
          multiple
          placeholder="No filters: every message"
          class="w-full"
          aria-label="Message filters"
        />
        <AsideNote v-else>
          This account has no message filters yet. Add them in
          <ULink
            :to="`/t/${tenant?.slug}/settings`"
            class="underline"
          >Settings</ULink>.
        </AsideNote>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="filtersOpen = false"
          />
          <UButton
            label="Save"
            :loading="savingFilters"
            :disabled="!filterItems.length"
            @click="saveFilters"
          />
        </div>
      </template>
    </UModal>
    <UModal
      v-model:open="inviteOpen"
      title="Invite a member"
    >
      <template #body>
        <UForm
          id="invite-form"
          :schema="inviteSchema"
          :state="inviteState"
          class="space-y-4"
          @submit="onInvite"
        >
          <UFormField
            label="Email"
            name="email"
          >
            <UInput
              v-model="inviteState.email"
              type="email"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Role"
            name="role"
            help="Viewers can see messages and recordings. Admins can also manage members. Owners can also manage other owners."
          >
            <USelect
              v-model="inviteState.role"
              :items="roleItems"
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
            form="invite-form"
            label="Send invitation"
            :loading="inviting"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

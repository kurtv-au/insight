<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

const { tenant, context, can } = useTenant()
const { user } = useUserSession()
const toast = useToast()
useSeoMeta({ title: 'Settings' })

// The parent route remounts this page when the tenant changes, so the ID is fixed
const tenantId = tenant.value!.id

// Timezone
const timezoneOptions = timezoneItems()
const schema = z.object({ timezone: timezoneSchema })
const state = reactive({ timezone: tenant.value!.timezone as Timezone })
const saving = ref(false)

async function onSave(event: FormSubmitEvent<z.output<typeof schema>>) {
  saving.value = true
  try {
    await $fetch(`/api/tenants/${tenantId}`, { method: 'PATCH', body: event.data })
    if (context.value) {
      context.value.tenant.timezone = event.data.timezone
    }
    await refreshNuxtData('my-tenants')
    toast.add({ title: `Timezone set to ${timezoneLabel(event.data.timezone)}`, color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

// Message fields, set up by platform admins on their own page
const { data: messageSetup } = await useFetch(`/api/admin/tenants/${tenantId}/message-fields`, {
  immediate: !!user.value?.isPlatformAdmin
})
const messageSetupSummary = computed(() => {
  const setup = messageSetup.value
  if (!setup?.fields.length) {
    return 'No message fields yet, so the messages page isn’t set up.'
  }
  const count = `${setup.fields.length} ${setup.fields.length === 1 ? 'field' : 'fields'}`
  const source = setup.settings.scriptAccountNumber ? ` from account ${setup.settings.scriptAccountNumber}’s script` : ''
  const orphaned = setup.fields.filter(field => field.orphaned).length
  return `${count}${source}.${orphaned ? ` ${orphaned} no longer in the script.` : ''}`
})

// Recording columns. Plans without recordings show them locked (staff still open them).
const recordingsLocked = computed(() => !planIncludes(tenant.value!.plan, 'recordings') && !user.value?.isPlatformAdmin)
const { data: recordingConfig, refresh: refreshRecordingConfig } = await useFetch(`/api/tenants/${tenantId}/recordings/config`, {
  immediate: can('admin') && !recordingsLocked.value
})

function columnItems(columns: readonly RecordingColumn[]) {
  return columns.map(column => ({ label: RECORDING_COLUMN_LABELS[column], value: column, disabled: column === 'timestamp' }))
}

const defaultColumns = ref<RecordingColumn[]>([])
const availableColumns = ref<RecordingColumn[]>([])
watch(recordingConfig, (config) => {
  if (config) {
    defaultColumns.value = config.accountDefault ?? [...config.available]
    availableColumns.value = [...config.available]
  }
}, { immediate: true })

const savingDefaults = ref(false)
async function saveDefaultColumns() {
  savingDefaults.value = true
  try {
    await $fetch(`/api/tenants/${tenantId}`, { method: 'PATCH', body: { recordingDefaultColumns: normalizeColumns(defaultColumns.value) } })
    await refreshRecordingConfig()
    toast.add({ title: 'Default columns saved', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingDefaults.value = false
  }
}

// Recording setup (platform admins only)
const savingAvailable = ref(false)
async function saveAvailableColumns() {
  savingAvailable.value = true
  try {
    await $fetch(`/api/admin/tenants/${tenantId}`, { method: 'PATCH', body: { recordingColumns: normalizeColumns(availableColumns.value) } })
    await refreshRecordingConfig()
    toast.add({ title: 'Available columns saved', color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingAvailable.value = false
  }
}

// Plan (platform admins only)
const planOptions = PLANS.map(value => ({ value, label: PLAN_LABELS[value] }))
const plan = ref<Plan>(tenant.value!.plan)
const savingPlan = ref(false)
async function savePlan() {
  savingPlan.value = true
  try {
    await $fetch(`/api/admin/tenants/${tenantId}`, { method: 'PATCH', body: { plan: plan.value } })
    if (context.value) {
      context.value.tenant.plan = plan.value
    }
    toast.add({ title: `Plan set to ${PLAN_LABELS[plan.value]}`, color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    savingPlan.value = false
  }
}

// Account numbers (platform admins only). Messages and recordings both come
// from these, so they have their own section whatever the plan includes.
const { data: accountNumbersData, refresh: refreshAccountNumbers } = await useFetch(`/api/admin/tenants/${tenantId}/recording-accounts`, {
  immediate: !!user.value?.isPlatformAdmin
})
const accountNumbers = computed(() => accountNumbersData.value?.accountNumbers ?? [])

const accountNumberForm = z.object({ accountNumber: accountNumberSchema })
const newAccount = reactive({ accountNumber: '' })
const addingAccount = ref(false)

async function addAccountNumber(event: FormSubmitEvent<z.output<typeof accountNumberForm>>) {
  addingAccount.value = true
  try {
    await $fetch(`/api/admin/tenants/${tenantId}/recording-accounts`, { method: 'POST', body: event.data })
    newAccount.accountNumber = ''
    await refreshAccountNumbers()
    toast.add({ title: `${event.data.accountNumber} connected`, color: 'success' })
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    addingAccount.value = false
  }
}

const confirm = useConfirm()
async function removeAccountNumber(accountNumber: string) {
  const confirmed = await confirm({
    title: `Disconnect ${accountNumber}?`,
    description: 'Messages and recordings from this account number will no longer appear in this account.',
    confirmLabel: 'Disconnect'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`/api/admin/tenants/${tenantId}/recording-accounts/${encodeURIComponent(accountNumber)}`, { method: 'DELETE' })
    await refreshAccountNumbers()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[860px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      :kicker="tenant?.name ?? 'Account'"
      title="Settings"
      description="Settings that apply to everyone in this account."
    />

    <UAlert
      v-if="!can('admin')"
      class="mt-10"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      description="Only owners and admins can change account settings."
    />

    <template v-else>
      <section class="mt-10">
        <SectionKicker
          number="01"
          label="Timezone"
          class="mb-3"
        />
        <UCard>
          <UForm
            :schema="schema"
            :state="state"
            class="space-y-4"
            @submit="onSave"
          >
            <UFormField
              label="Timezone"
              name="timezone"
              :help="`Messages and recordings are shown in this timezone for everyone in ${tenant?.name}, unless they choose their own on their Account page.`"
            >
              <USelect
                v-model="state.timezone"
                :items="timezoneOptions"
                class="w-full sm:max-w-xs"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Save"
              :loading="saving"
            />
          </UForm>
        </UCard>
      </section>

      <section
        v-if="recordingConfig || recordingsLocked"
        class="mt-10"
      >
        <SectionKicker
          number="02"
          label="Recordings"
          class="mb-3"
        />
        <PlanLocked
          v-if="recordingsLocked"
          feature="recordings"
          title="Call recordings"
        />
        <UCard v-else>
          <div class="space-y-4">
            <UFormField
              label="Default columns"
              :help="`What people in ${tenant?.name} see in the recordings list until they choose their own.`"
            >
              <UCheckboxGroup
                v-model="defaultColumns"
                :items="columnItems(recordingConfig?.available ?? [])"
                class="mt-1"
              />
            </UFormField>
            <UButton
              label="Save"
              :loading="savingDefaults"
              @click="saveDefaultColumns"
            />
          </div>
        </UCard>
      </section>

      <section class="mt-10">
        <SectionKicker
          number="03"
          label="Message filters"
          class="mb-3"
        />
        <MessageFilterSettings
          :tenant-id="tenantId"
          :tenant-slug="tenant!.slug"
        />
      </section>

      <section
        v-if="user?.isPlatformAdmin"
        class="mt-10"
      >
        <SectionKicker
          number="04"
          label="Plan"
          class="mb-3"
        />
        <StaffOnlyCard>
          <div class="space-y-4">
            <UFormField
              label="Plan"
              help="Decides what this account’s users get. Staff open every feature whatever the plan."
            >
              <USelect
                v-model="plan"
                :items="planOptions"
                class="w-full sm:max-w-xs"
              />
            </UFormField>
            <div>
              <p class="text-sm font-medium text-default">
                {{ PLAN_LABELS[plan] }} includes
              </p>
              <ul class="mt-2 space-y-1 text-body-sm">
                <li class="text-default">
                  Up to {{ planMaxUsers(plan) }} {{ planMaxUsers(plan) === 1 ? 'user' : 'users' }}, and {{ describeHistoryDays(planHistoryDays(plan)) }} of history
                </li>
                <li
                  v-for="feature in PLAN_FEATURES"
                  :key="feature.key"
                  class="flex items-center gap-2"
                  :class="planIncludes(plan, feature.key) ? 'text-default' : 'text-dimmed line-through'"
                >
                  <UIcon
                    :name="planIncludes(plan, feature.key) ? 'i-lucide-check' : 'i-lucide-minus'"
                    class="size-4 shrink-0"
                  />
                  {{ feature.label }}
                </li>
              </ul>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                label="Save"
                :loading="savingPlan"
                :disabled="plan === tenant?.plan"
                @click="savePlan"
              />
              <UButton
                label="All plans"
                icon="i-lucide-layers"
                color="neutral"
                variant="ghost"
                to="/admin/plans"
              />
            </div>
          </div>
        </StaffOnlyCard>
      </section>

      <section
        v-if="user?.isPlatformAdmin"
        class="mt-10"
      >
        <SectionKicker
          number="05"
          label="Account numbers"
          class="mb-3"
        />
        <StaffOnlyCard>
          <p class="text-body-sm text-muted">
            The client numbers this account’s messages and recordings come from, whatever its plan. Message setup (06) uses one of their scripts.
          </p>

          <ul
            v-if="accountNumbers.length"
            class="mt-3 divide-y divide-muted border-y border-muted"
          >
            <li
              v-for="accountNumber in accountNumbers"
              :key="accountNumber"
              class="flex items-center justify-between gap-3 py-2"
            >
              <span class="tabular-nums text-highlighted">{{ accountNumber }}</span>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="sm"
                :aria-label="`Disconnect ${accountNumber}`"
                @click="removeAccountNumber(accountNumber)"
              />
            </li>
          </ul>
          <AsideNote
            v-else
            class="mt-3"
          >
            None yet, so this account has no messages or recordings.
          </AsideNote>

          <UForm
            :schema="accountNumberForm"
            :state="newAccount"
            class="mt-3 flex items-start gap-2"
            @submit="addAccountNumber"
          >
            <UFormField
              name="accountNumber"
              class="w-full sm:max-w-xs"
            >
              <UInput
                v-model="newAccount.accountNumber"
                placeholder="Account number"
                aria-label="Account number"
                inputmode="numeric"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Add"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :loading="addingAccount"
            />
          </UForm>
        </StaffOnlyCard>
      </section>

      <section
        v-if="user?.isPlatformAdmin"
        class="mt-10"
      >
        <SectionKicker
          number="06"
          label="Message setup"
          class="mb-3"
        />
        <StaffOnlyCard>
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-medium text-default">
                Message fields
              </p>
              <p class="mt-1 text-body-sm text-muted">
                {{ messageSetupSummary }}
              </p>
            </div>
            <UButton
              label="Configure message fields"
              icon="i-lucide-list-checks"
              color="neutral"
              variant="outline"
              :to="`/t/${tenant?.slug}/settings/message-fields`"
            />
          </div>
        </StaffOnlyCard>
      </section>

      <section
        v-if="recordingConfig && user?.isPlatformAdmin"
        class="mt-10"
      >
        <SectionKicker
          number="07"
          label="Recording setup"
          class="mb-3"
        />
        <StaffOnlyCard>
          <AsideNote
            v-if="!planIncludes(tenant!.plan, 'recordings')"
            class="mb-4"
          >
            The {{ PLAN_LABELS[tenant!.plan] }} plan doesn’t include recordings, so its users don’t see these. They’re kept for when the account moves up a plan.
          </AsideNote>
          <div class="space-y-4">
            <UFormField
              label="Available columns"
              help="Columns this account can use. Owners and admins choose the defaults from these."
            >
              <UCheckboxGroup
                v-model="availableColumns"
                :items="columnItems(RECORDING_COLUMNS)"
                class="mt-1"
              />
            </UFormField>
            <UButton
              label="Save"
              :loading="savingAvailable"
              @click="saveAvailableColumns"
            />
          </div>
        </StaffOnlyCard>
      </section>
    </template>
  </div>
</template>

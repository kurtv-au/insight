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

// Recording columns
const { data: recordingConfig, refresh: refreshRecordingConfig } = await useFetch(`/api/tenants/${tenantId}/recordings/config`, {
  immediate: can('admin')
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

const accountNumberForm = z.object({ accountNumber: accountNumberSchema })
const newAccount = reactive({ accountNumber: '' })
const addingAccount = ref(false)

async function addAccountNumber(event: FormSubmitEvent<z.output<typeof accountNumberForm>>) {
  addingAccount.value = true
  try {
    await $fetch(`/api/admin/tenants/${tenantId}/recording-accounts`, { method: 'POST', body: event.data })
    newAccount.accountNumber = ''
    await refreshRecordingConfig()
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
    description: 'Recordings from this account number will no longer appear in this account.',
    confirmLabel: 'Disconnect'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`/api/admin/tenants/${tenantId}/recording-accounts/${encodeURIComponent(accountNumber)}`, { method: 'DELETE' })
    await refreshRecordingConfig()
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
        v-if="recordingConfig"
        class="mt-10"
      >
        <SectionKicker
          number="02"
          label="Recordings"
          class="mb-3"
        />
        <UCard>
          <div class="space-y-4">
            <UFormField
              label="Default columns"
              :help="`What people in ${tenant?.name} see in the recordings list until they choose their own.`"
            >
              <UCheckboxGroup
                v-model="defaultColumns"
                :items="columnItems(recordingConfig.available)"
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

      <section
        v-if="recordingConfig && user?.isPlatformAdmin"
        class="mt-10"
      >
        <SectionKicker
          number="03"
          label="Recording setup"
          class="mb-3"
        />
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UBadge
                label="Answer United only"
                color="neutral"
                variant="subtle"
                icon="i-lucide-shield"
              />
              <p class="text-body-sm text-muted">
                Customers don’t see this section.
              </p>
            </div>
          </template>

          <div class="space-y-8">
            <div>
              <p class="text-sm font-medium text-default">
                Account numbers
              </p>
              <p class="mt-1 text-body-sm text-muted">
                Recordings from these account numbers appear in this account.
              </p>

              <ul
                v-if="recordingConfig.accountNumbers.length"
                class="mt-3 divide-y divide-muted border-y border-muted"
              >
                <li
                  v-for="accountNumber in recordingConfig.accountNumbers"
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
                None yet, so this account has no recordings.
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
            </div>

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
          </div>
        </UCard>
      </section>
    </template>
  </div>
</template>

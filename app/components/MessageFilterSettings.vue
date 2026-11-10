<script setup lang="ts">
import type { DropdownMenuItem, FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

// The account's message filters: named `field = value` rules that owners and
// admins assign to people on the Members page.
const props = defineProps<{ tenantId: string, tenantSlug: string }>()
const toast = useToast()
const confirm = useConfirm()

const api = `/api/tenants/${props.tenantId}/message-filters` as const
const { data, refresh, error } = await useFetch(api, { default: () => ({ filters: [], fields: [] }) })

type Filter = MessageFilterDto

const fieldLabels = computed(() => new Map(data.value.fields.map(field => [canonicalFieldKey(field.fieldKey), field.label])))
function fieldLabel(fieldKey: string) {
  return fieldLabels.value.get(canonicalFieldKey(fieldKey)) ?? fieldKey
}
const fieldItems = computed(() => data.value.fields.map(field => ({
  label: field.label,
  value: field.fieldKey,
  description: field.label.toLowerCase() === field.fieldKey.toLowerCase() ? undefined : field.fieldKey
})))

const editOpen = ref(false)
const editing = ref<Filter | null>(null)
const state = reactive({ name: '', fieldKey: '', value: '' })
const saving = ref(false)

function openEditor(filter: Filter | null) {
  editing.value = filter
  state.name = filter?.name ?? ''
  state.fieldKey = filter?.fieldKey ?? data.value.fields[0]?.fieldKey ?? ''
  state.value = filter?.value ?? ''
  editOpen.value = true
}

async function onSave(event: FormSubmitEvent<z.output<typeof messageFilterSchema>>) {
  saving.value = true
  try {
    const filter = editing.value
    await $fetch(filter ? `${api}/${filter.id}` : api, { method: filter ? 'PATCH' : 'POST', body: event.data })
    toast.add({ title: filter ? `${event.data.name} saved` : `${event.data.name} added`, color: 'success' })
    editOpen.value = false
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function removeFilter(filter: Filter) {
  const confirmed = await confirm({
    title: `Remove ${filter.name}?`,
    description: filter.members
      ? `It’s assigned to ${filter.members === 1 ? '1 person' : `${filter.members} people`}, who will no longer see messages through it.`
      : 'Nobody has it assigned.',
    confirmLabel: 'Remove'
  })
  if (!confirmed) {
    return
  }
  try {
    await $fetch(`${api}/${filter.id}`, { method: 'DELETE' })
    await refresh()
  } catch (err) {
    toast.add({ title: errorMessage(err), color: 'error' })
  }
}

function filterActions(filter: Filter): DropdownMenuItem[] {
  return [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditor(filter) },
    { label: 'Remove', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeFilter(filter) }
  ]
}
</script>

<template>
  <UCard>
    <div class="flex flex-wrap items-start justify-between gap-4">
      <p class="min-w-0 max-w-prose text-body-sm text-muted">
        Assign filters to viewers on the
        <ULink
          :to="`/t/${tenantSlug}/members`"
          class="text-default underline"
        >Members page</ULink>
        and they see only messages where one of their filters matches. People without filters, and every admin and owner, see every message.
      </p>
      <UButton
        label="Add filter"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="!data.fields.length"
        @click="openEditor(null)"
      />
    </div>

    <UAlert
      v-if="error"
      class="mt-4"
      color="error"
      variant="subtle"
      :description="errorMessage(error)"
    />
    <AsideNote
      v-else-if="!data.fields.length"
      class="mt-4"
    >
      Filters use the fields in this account’s message setup, which Answer United hasn’t done yet.
    </AsideNote>

    <div
      v-if="data.filters.length"
      class="mt-4 divide-y divide-muted rounded-standard border border-default"
    >
      <div class="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_5rem_2rem] gap-3 px-4 py-2 text-body-sm text-muted sm:grid">
        <span>Name</span>
        <span>Field</span>
        <span>Value</span>
        <span class="text-right">People</span>
        <span />
      </div>
      <div
        v-for="filter in data.filters"
        :key="filter.id"
        class="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_5rem_2rem]"
      >
        <span class="truncate text-body-sm text-highlighted">{{ filter.name }}</span>
        <span class="col-start-1 row-start-2 flex min-w-0 items-center gap-2 text-body-sm text-default sm:col-start-auto sm:row-start-auto">
          <span class="truncate">{{ fieldLabel(filter.fieldKey) }}</span>
          <UTooltip
            v-if="filter.orphaned"
            text="This field is no longer in the account’s script, so the filter matches nothing"
          >
            <UBadge
              label="Not in script"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </UTooltip>
        </span>
        <span class="col-start-1 truncate text-body-sm text-default sm:col-start-auto">
          <span class="text-muted sm:hidden">= </span>{{ filter.value }}
        </span>
        <span class="mono-meta hidden text-right sm:block">{{ filter.members }}</span>
        <UDropdownMenu
          :items="filterActions(filter)"
          :content="{ align: 'end' }"
          class="col-start-2 row-span-3 row-start-1 sm:col-start-auto sm:row-span-1 sm:row-start-auto"
        >
          <UButton
            icon="i-lucide-ellipsis"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Actions for ${filter.name}`"
          />
        </UDropdownMenu>
      </div>
    </div>
    <p
      v-else-if="data.fields.length"
      class="mt-4 text-body-sm text-muted"
    >
      No filters yet.
    </p>

    <UModal
      v-model:open="editOpen"
      :title="editing ? `Edit ${editing.name}` : 'Add a message filter'"
    >
      <template #body>
        <UForm
          id="message-filter-form"
          :schema="messageFilterSchema"
          :state="state"
          class="space-y-4"
          @submit="onSave"
        >
          <UFormField
            label="Name"
            name="name"
          >
            <UInput
              v-model="state.name"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Field"
            name="fieldKey"
            help="Any field in the message setup, shown on the messages page or not."
          >
            <USelectMenu
              v-model="state.fieldKey"
              :items="fieldItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Value"
            name="value"
            help="Matches messages where the field is exactly this, ignoring case and surrounding spaces."
          >
            <UInput
              v-model="state.value"
              class="w-full"
            />
          </UFormField>
          <AsideNote v-if="editing?.members">
            Changes apply at once to the {{ editing.members === 1 ? 'person' : `${editing.members} people` }} it’s assigned to.
          </AsideNote>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="editOpen = false"
          />
          <UButton
            type="submit"
            form="message-filter-form"
            :label="editing ? 'Save' : 'Add filter'"
            :loading="saving"
          />
        </div>
      </template>
    </UModal>
  </UCard>
</template>

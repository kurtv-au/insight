<script setup lang="ts">
import type { SortableEvent } from 'sortablejs'
import { moveArrayElement, useSortable } from '@vueuse/integrations/useSortable'

// Platform admins only. Under the account (/t/[tenant]/settings) so the rail,
// switcher and status banners show which account is being configured.
definePageMeta({ middleware: 'admin' })

const toast = useToast()
const confirm = useConfirm()
const { tenant } = useTenant()

const tenantId = tenant.value!.id
const api = `/api/admin/tenants/${tenantId}/message-fields` as const

const { data: config, refresh: refreshConfig, error: configError } = await useFetch(api)
if (configError.value) {
  throw createError({ statusCode: configError.value.statusCode ?? 404, message: errorMessage(configError.value, 'Tenant not found'), fatal: true })
}
useSeoMeta({ title: () => `Message fields · ${config.value?.tenant.name ?? 'Account'}` })

type AdminMessageConfig = NonNullable<typeof config.value>

const timeZone = computed(() => config.value?.tenant.timezone ?? DEFAULT_TIMEZONE)

// ---------------------------------------------------------------- draft

type Draft = { account: string | null, fields: MessageFieldConfig[] }

function toDraftField(field: SavedMessageField): MessageFieldConfig {
  const { fieldKey, label, type, format, order, showInList, showInDetail, isActive, showIfOrphaned } = field
  return structuredClone({ fieldKey, label, type, format, order, showInList, showInDetail, isActive, showIfOrphaned })
}

function savedDraft(): Draft {
  const c = config.value
  return {
    account: c?.settings.scriptAccountNumber ?? c?.accountNumbers[0] ?? null,
    fields: (c?.fields ?? []).map(toDraftField)
  }
}

const account = ref<string | null>(null)
const fields = ref<MessageFieldConfig[]>([])

function resetDraft() {
  const draft = savedDraft()
  account.value = draft.account
  fields.value = draft.fields
}
resetDraft()

// `order` follows the list; the array position is the truth while editing
const orderedFields = computed(() => fields.value.map((field, order) => ({ ...field, order })))
const snapshot = (draft: Draft) => JSON.stringify({ account: draft.account, fields: draft.fields.map((field, order) => ({ ...field, order })) })
const baseline = computed(() => snapshot(savedDraft()))
const dirty = computed(() => snapshot({ account: account.value, fields: fields.value }) !== baseline.value)

// ---------------------------------------------------------------- script

const { data: available, status: availableStatus, error: availableError, refresh: refreshAvailable } = await useFetch(`${api}/available`, {
  query: computed(() => ({ account: account.value ?? undefined })),
  immediate: !!config.value?.accountNumbers.length,
  watch: [account]
})
const script = computed(() => available.value?.accountNumber === account.value ? (available.value?.script ?? null) : null)
const scriptLoaded = computed(() => availableStatus.value === 'success' && available.value?.accountNumber === account.value)

const drift = computed(() => diffScriptFields({
  configured: fields.value,
  script: script.value,
  knownKeys: config.value?.settings.knownFieldKeys
}))
const scriptByKey = computed(() => new Map((script.value?.fields ?? []).map(field => [canonicalFieldKey(field.key), field])))
const savedOrphans = computed(() => new Set((config.value?.fields ?? []).filter(field => field.orphaned).map(field => canonicalFieldKey(field.fieldKey))))

/** Live against the loaded script; until it loads, what the last save found */
function isOrphaned(field: MessageFieldConfig) {
  const key = canonicalFieldKey(field.fieldKey)
  return scriptLoaded.value ? drift.value.orphanedKeys.has(key) : savedOrphans.value.has(key)
}

// Script variables are hidden by default, so they don't count toward "new"
const newCount = computed(() => drift.value.available
  .filter(field => field.state === 'new' && (field.sources.includes('screen') || field.sources.includes('callField'))).length)
const orphanCount = computed(() => fields.value.filter(isOrphaned).length)

// ---------------------------------------------------------------- editing

const liveMessage = ref('')
const listEl = useTemplateRef<HTMLElement>('selectedList')

// Rows are one line each until opened, so the list stays easy to drag through.
// Kept by field key, so an open row stays open when it moves.
const expanded = ref(new Set<string>())
const allExpanded = computed(() => fields.value.length > 0 && fields.value.every(f => expanded.value.has(canonicalFieldKey(f.fieldKey))))

function addField(field: ScriptFieldDto, at = fields.value.length) {
  if (fields.value.some(f => canonicalFieldKey(f.fieldKey) === canonicalFieldKey(field.key))) {
    return
  }
  const next = [...fields.value]
  next.splice(at, 0, newFieldFromScript(field, at))
  fields.value = next
  // Open a new field's settings: its label is usually the first thing to change
  expanded.value = new Set(expanded.value).add(canonicalFieldKey(field.key))
  liveMessage.value = `Added ${field.label ?? field.key} at position ${at + 1} of ${next.length}`
}

function toggleField(field: MessageFieldConfig) {
  const key = canonicalFieldKey(field.fieldKey)
  const next = new Set(expanded.value)
  if (!next.delete(key)) {
    next.add(key)
  }
  expanded.value = next
}

function toggleAll() {
  expanded.value = allExpanded.value ? new Set() : new Set(fields.value.map(f => canonicalFieldKey(f.fieldKey)))
}

function removeField(index: number) {
  const [removed] = fields.value.splice(index, 1)
  liveMessage.value = `Removed ${removed?.label}`
}

async function moveField(index: number, offset: number) {
  const to = index + offset
  if (to < 0 || to >= fields.value.length) {
    return
  }
  const fromHandle = !!document.activeElement?.hasAttribute('data-drag-handle')
  const next = [...fields.value]
  const [field] = next.splice(index, 1)
  next.splice(to, 0, field!)
  fields.value = next
  liveMessage.value = `Moved ${field!.label} to position ${to + 1} of ${next.length}`
  // Keep focus on the moved field, on the same control
  await nextTick()
  const row = listEl.value?.querySelector(`[data-key="${CSS.escape(canonicalFieldKey(field!.fieldKey))}"]`)
  const handle = row?.querySelector<HTMLButtonElement>('[data-drag-handle]')
  const button = row?.querySelector<HTMLButtonElement>(`[data-action="${offset < 0 ? 'up' : 'down'}"]:not(:disabled)`)
  ;((fromHandle ? handle : button) ?? handle)?.focus()
}

const DRAG_GROUP = 'message-fields'
useSortable(listEl, fields, {
  group: { name: DRAG_GROUP, pull: false, put: true },
  handle: '[data-drag-handle]',
  draggable: '[data-field-row]',
  animation: 150,
  // Mouse/touch events rather than native drag and drop: browsers won't start a
  // native drag from a <button>, which the handle is. Both lists must match.
  forceFallback: true,
  onUpdate: (e: SortableEvent) => {
    moveArrayElement(fields, e.oldDraggableIndex!, e.newDraggableIndex!, e)
    const field = fields.value[e.oldDraggableIndex!]
    liveMessage.value = `Moved ${field?.label} to position ${e.newDraggableIndex! + 1} of ${fields.value.length}`
  },
  // A field dragged in from the script list. Sortable moved the real element
  // here and left a clone behind; put both back so Vue keeps owning the DOM,
  // then add the field through the data.
  onAdd: (e: SortableEvent) => {
    const key = e.item.dataset.fieldKey
    // newIndex, not newDraggableIndex: the dropped element isn't a row, so the
    // draggable count skips it. The list holds nothing but rows otherwise.
    const at = Math.min(e.newIndex ?? fields.value.length, fields.value.length)
    e.clone?.parentNode?.removeChild(e.clone)
    e.item.parentNode?.removeChild(e.item)
    e.from.insertBefore(e.item, e.from.children[e.oldIndex ?? 0] ?? null)
    const field = script.value?.fields.find(f => f.key === key)
    if (field) {
      addField(field, at)
    }
  }
})

// ---------------------------------------------------------------- validation

const body = computed(() => ({
  revision: config.value?.settings.revision ?? 0,
  scriptAccountNumber: account.value,
  fields: orderedFields.value
}))
const validation = computed(() => messageFieldConfigInputSchema.safeParse(body.value))
const rowErrors = computed(() => {
  const errors = new Map<number, string>()
  if (!validation.value.success) {
    for (const issue of validation.value.error.issues) {
      const [scope, index] = issue.path
      if (scope === 'fields' && typeof index === 'number' && !errors.has(index)) {
        errors.set(index, issue.message)
      }
    }
  }
  return errors
})
// Open a row when it gets a problem, so its message and the setting are in view
watch(rowErrors, (errors) => {
  const keys = [...errors.keys()].map(index => fields.value[index]).filter(f => !!f).map(f => canonicalFieldKey(f.fieldKey))
  if (keys.some(key => !expanded.value.has(key))) {
    expanded.value = new Set([...expanded.value, ...keys])
  }
})
const formErrors = computed(() => validation.value.success
  ? []
  : validation.value.error.issues.filter(issue => typeof issue.path[1] !== 'number').map(issue => issue.message))
const problemCount = computed(() => validation.value.success ? 0 : validation.value.error.issues.length)

// ---------------------------------------------------------------- preview

const previewFields = computed<MessageColumnField[]>(() => orderedFields.value
  .filter(field => field.isActive && (!isOrphaned(field) || field.showIfOrphaned)))

// ---------------------------------------------------------------- save

const saving = ref(false)

async function save() {
  if (!validation.value.success) {
    toast.add({ title: 'Fix the highlighted fields before saving', color: 'error' })
    return
  }
  saving.value = true
  try {
    // Typed by hand: inferring this route's type exceeds TypeScript's depth limit
    config.value = await $fetch<AdminMessageConfig>(api as string, { method: 'PUT', body: body.value })
    resetDraft()
    toast.add({ title: 'Message fields saved', color: 'success' })
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 409 && await confirm({
      title: 'These fields changed since you opened them',
      description: `${errorMessage(err)} Reloading discards your changes here.`,
      confirmLabel: 'Reload'
    })) {
      await refreshConfig()
      resetDraft()
    } else if (status !== 409) {
      toast.add({ title: errorMessage(err), color: 'error' })
    }
  } finally {
    saving.value = false
  }
}

async function discard() {
  if (await confirm({ title: 'Discard unsaved changes?', description: 'The fields go back to how they were last saved.', confirmLabel: 'Discard' })) {
    resetDraft()
  }
}

// ---------------------------------------------------------------- leaving

onBeforeRouteLeave(async () => {
  if (!dirty.value || saving.value) {
    return true
  }
  return await confirm({ title: 'Leave without saving?', description: 'Your changes to these message fields will be lost.', confirmLabel: 'Leave' })
})

function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
  }
}
onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload))

const savedSummary = computed(() => {
  const settings = config.value?.settings
  if (!settings?.updatedAt) {
    return 'Not saved yet'
  }
  return `Saved ${formatDateTime(settings.updatedAt, timeZone.value)}${settings.updatedBy ? ` by ${settings.updatedBy}` : ''}`
})
</script>

<template>
  <div
    v-if="config"
    class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8"
  >
    <PageHeader
      :kicker="`Admin · ${config.tenant.name}`"
      title="Message fields"
      description="Choose which fields of the account’s active script its messages page shows, in what order, and how each is formatted."
    >
      <template #actions>
        <UButton
          label="Open messages"
          icon="i-lucide-arrow-up-right"
          color="neutral"
          variant="outline"
          :to="`/t/${config.tenant.slug}/messages`"
        />
      </template>
    </PageHeader>

    <section class="mt-10">
      <SectionKicker
        number="01"
        label="Script"
        class="mb-3"
      />
      <MessageFieldsSourceBar
        v-model:account="account"
        :account-numbers="config.accountNumbers"
        :script="script"
        :loading="availableStatus === 'pending'"
        :error="availableError ? errorMessage(availableError) : null"
        :loaded="scriptLoaded"
        :saved-version="config.settings.scriptVersion"
        :saved-script-id="config.settings.scriptId"
        :time-zone="timeZone"
        :tenant-slug="config.tenant.slug"
        @refresh="refreshAvailable()"
      />
    </section>

    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <section>
        <SectionKicker
          number="02"
          label="Available"
          :count="newCount ? `${newCount} new` : undefined"
          class="mb-3"
        />
        <MessageFieldsAvailableList
          v-if="script"
          :fields="drift.available"
          :group="DRAG_GROUP"
          @add="addField($event)"
        />
        <AsideNote v-else-if="availableStatus === 'pending'">
          Loading the script’s fields…
        </AsideNote>
        <AsideNote v-else>
          No script fields to show.
        </AsideNote>
      </section>

      <section>
        <SectionKicker
          number="03"
          label="Selected"
          :count="`${fields.length} ${fields.length === 1 ? 'field' : 'fields'}${orphanCount ? ` · ${orphanCount} not in script` : ''}`"
          class="mb-3"
        />
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p class="text-body-sm text-muted">
            In list order. Drag by the handle, or use the arrows. Open a field to change its label, type and format.
          </p>
          <UButton
            v-if="fields.length"
            :label="allExpanded ? 'Collapse all' : 'Expand all'"
            :icon="allExpanded ? 'i-lucide-chevrons-down-up' : 'i-lucide-chevrons-up-down'"
            color="neutral"
            variant="link"
            size="xs"
            @click="toggleAll"
          />
        </div>
        <ul
          ref="selectedList"
          class="min-h-24 space-y-1.5 rounded-standard"
          :class="!fields.length && 'border border-dashed border-default'"
          aria-label="Selected fields"
        >
          <MessageFieldsSelectedRow
            v-for="(field, index) in fields"
            :key="canonicalFieldKey(field.fieldKey)"
            :field="field"
            :data-key="canonicalFieldKey(field.fieldKey)"
            :index="index"
            :count="fields.length"
            :script-field="scriptByKey.get(canonicalFieldKey(field.fieldKey)) ?? null"
            :orphaned="isOrphaned(field)"
            :suggested-type="drift.typeMismatches.get(canonicalFieldKey(field.fieldKey)) ?? null"
            :expanded="expanded.has(canonicalFieldKey(field.fieldKey))"
            :error="rowErrors.get(index)"
            @update:field="fields[index] = $event"
            @move="moveField(index, $event)"
            @remove="removeField(index)"
            @toggle="toggleField(field)"
          />
        </ul>
        <AsideNote
          v-if="!fields.length"
          class="mt-3"
        >
          No fields yet. Add them from the script, or drag them here.
        </AsideNote>
        <p
          class="sr-only"
          aria-live="polite"
        >
          {{ liveMessage }}
        </p>
      </section>
    </div>

    <section class="mt-10">
      <SectionKicker
        number="04"
        label="Preview"
        class="mb-3"
      />
      <p class="mb-3 text-body-sm text-muted">
        The messages list with sample data, as {{ config.tenant.name }} will see it. Times in {{ timezoneLabel(timeZone) }}.
      </p>
      <MessageFieldsPreview
        :fields="previewFields"
        :time-zone="timeZone"
      />
    </section>

    <div class="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-10 mt-10 lg:bottom-4">
      <div class="flex flex-wrap items-center justify-between gap-3 rounded-standard border border-default bg-default/95 px-4 py-3 shadow-lg backdrop-blur">
        <div class="min-w-0 text-body-sm">
          <p
            v-if="dirty"
            class="font-medium text-highlighted"
          >
            Unsaved changes
          </p>
          <p
            v-else
            class="text-muted"
          >
            {{ savedSummary }}
          </p>
          <p
            v-if="dirty && problemCount"
            class="text-error"
          >
            {{ formErrors[0] ?? `Fix ${problemCount} ${problemCount === 1 ? 'problem' : 'problems'} before saving` }}
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            label="Discard"
            color="neutral"
            variant="outline"
            :disabled="!dirty || saving"
            @click="discard"
          />
          <UButton
            label="Save"
            icon="i-lucide-check"
            :loading="saving"
            :disabled="!dirty"
            @click="save"
          />
        </div>
      </div>
    </div>
  </div>
</template>

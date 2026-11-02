<script setup lang="ts">
// Which account's active script the fields come from, and its state
const props = defineProps<{
  accountNumbers: string[]
  script: ActiveScriptDto | null
  loading: boolean
  error: string | null
  /** True once a lookup has finished for the current account */
  loaded: boolean
  /** The script version the configuration was last saved against */
  savedVersion: number | null
  savedScriptId: number | null
  timeZone: string
  tenantSlug: string
}>()

const account = defineModel<string | null>('account', { required: true })

const emit = defineEmits<{
  refresh: []
}>()

const accountItems = computed(() => props.accountNumbers.map(number => ({ label: number, value: number })))
const changed = computed(() => !!props.script && props.savedScriptId !== null
  && (props.savedScriptId !== props.script.scriptId || props.savedVersion !== props.script.versionNumber))
</script>

<template>
  <UCard>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div class="flex flex-wrap items-end gap-6">
        <UFormField
          label="Account number"
          help="Fields come from this account’s active script."
        >
          <USelect
            v-if="accountNumbers.length > 1"
            :model-value="account ?? undefined"
            :items="accountItems"
            class="w-40"
            aria-label="Account number"
            @update:model-value="account = $event"
          />
          <p
            v-else
            class="py-1.5 text-sm tabular-nums text-highlighted"
          >
            {{ account ?? '—' }}
          </p>
        </UFormField>

        <div
          v-if="script"
          class="min-w-0"
        >
          <p class="kicker">
            Active script
          </p>
          <p class="mt-1 text-sm text-highlighted">
            {{ script.name }}
            <span class="text-muted">· version {{ script.versionNumber }}</span>
          </p>
          <p
            v-if="script.modifiedAt"
            class="mono-meta mt-0.5"
          >
            Published {{ formatDateTime(script.modifiedAt, timeZone) }}
          </p>
        </div>
      </div>

      <UButton
        label="Refresh from script"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="loading"
        :disabled="!account"
        @click="emit('refresh')"
      />
    </div>

    <UAlert
      v-if="!accountNumbers.length"
      class="mt-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-link"
      title="No account number connected"
      description="Message fields come from an account number’s active script. Connect one in this account’s settings first."
      :actions="[{ label: 'Open settings', to: `/t/${tenantSlug}/settings`, color: 'neutral', variant: 'outline' }]"
    />
    <UAlert
      v-else-if="error"
      class="mt-4"
      color="error"
      variant="subtle"
      icon="i-lucide-cloud-off"
      title="Couldn’t load the script"
      :description="error"
      :actions="[{ label: 'Try again', color: 'neutral', variant: 'outline', onClick: () => emit('refresh') }]"
    />
    <UAlert
      v-else-if="loaded && !script"
      class="mt-4"
      color="warning"
      variant="subtle"
      icon="i-lucide-file-x"
      :title="`Account ${account} has no active script`"
      description="There’s nothing to add from. Fields you keep are saved as no longer in the script, and the messages page leaves them out."
    />
    <template v-else-if="script">
      <UAlert
        v-if="!script.complete"
        class="mt-4"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Part of this script couldn’t be read"
        description="Some fields may be missing from the list. Nothing is marked as removed from the script until it reads completely."
      />
      <UAlert
        v-if="changed"
        class="mt-4"
        color="neutral"
        variant="subtle"
        icon="i-lucide-git-compare"
        title="The script has changed since these fields were saved"
        :description="`Saved against version ${savedVersion ?? '?'}; the active script is version ${script.versionNumber}. New fields are marked, and saved fields it dropped are flagged below.`"
      />
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import { z } from 'zod'

const { tenant, context, can } = useTenant()
const toast = useToast()
useSeoMeta({ title: 'Settings' })

const timezoneOptions = timezoneItems()
const schema = z.object({ timezone: timezoneSchema })
const state = reactive({ timezone: tenant.value!.timezone as Timezone })
const saving = ref(false)

async function onSave(event: FormSubmitEvent<z.output<typeof schema>>) {
  saving.value = true
  try {
    await $fetch(`/api/tenants/${tenant.value!.id}`, { method: 'PATCH', body: event.data })
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

    <section
      v-else
      class="mt-10"
    >
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
  </div>
</template>

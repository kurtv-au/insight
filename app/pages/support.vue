<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'

useSeoMeta({ title: 'Support' })

const route = useRoute()
const { user } = useUserSession()
const { data: myTenants } = await useMyTenants()

const NO_ACCOUNT = 'none'

const contacts = [
  { icon: 'i-lucide-headset', title: 'Customer Service', email: 'custserv@answerunited.com', phone: '(800) 259-0135' },
  { icon: 'i-lucide-briefcase', title: 'Sales', email: 'sales@answerunited.com', phone: '(800) 937-5900' },
  { icon: 'i-lucide-receipt', title: 'Billing', email: 'billing@answerunited.com', phone: '(800) 873-0434' }
]

const topicItems = SUPPORT_TOPICS.map(value => ({ value, label: SUPPORT_TOPIC_LABELS[value] }))
const accountItems = computed(() => [
  ...myTenants.value.map(t => ({ value: t.id, label: t.name })),
  { value: NO_ACCOUNT, label: 'Not about a specific account' }
])

// The rail links here with ?account=<slug> from inside an account
function defaultAccount() {
  const slug = typeof route.query.account === 'string' ? route.query.account : undefined
  const match = myTenants.value.find(t => t.slug === slug)
    ?? (myTenants.value.length === 1 ? myTenants.value[0] : undefined)
  return match?.id ?? NO_ACCOUNT
}

function initialState() {
  return { topic: 'service' as SupportTopic, account: defaultAccount(), subject: '', message: '' }
}

const state = reactive(initialState())
const loading = ref(false)
const sent = ref(false)
const error = ref('')

async function onSubmit(event: FormSubmitEvent<z.output<typeof supportRequestSchema>>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/support', {
      method: 'POST',
      body: { ...event.data, tenantId: state.account === NO_ACCOUNT ? undefined : state.account }
    })
    sent.value = true
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    loading.value = false
  }
}

function sendAnother() {
  Object.assign(state, initialState())
  sent.value = false
}

function telHref(phone: string) {
  return `tel:+1${phone.replace(/\D/g, '')}`
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1100px] px-6 py-6 sm:px-8 lg:px-10 lg:py-8">
    <PageHeader
      kicker="Support"
      title="We’re here to help."
      description="Have a question about your service, or feedback for us? Send a message below, or call or email the team directly."
    />

    <div class="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-14">
      <section aria-labelledby="support-form-heading">
        <SectionKicker
          number="01"
          label="Send us a message"
          class="mb-3"
        />
        <h2
          id="support-form-heading"
          class="sr-only"
        >
          Send us a message
        </h2>

        <UCard>
          <div
            v-if="sent"
            class="flex flex-col items-start gap-4 py-4"
            role="status"
          >
            <IconTile
              icon="i-lucide-mail-check"
              rounded="full"
            />
            <div>
              <p class="text-body-lg text-highlighted">
                Message sent
              </p>
              <p class="mt-1 text-body-sm text-muted">
                We’ll reply to {{ user?.email }} as soon as we can.
              </p>
            </div>
            <UButton
              label="Send another"
              color="neutral"
              variant="outline"
              @click="sendAnother"
            />
          </div>

          <UForm
            v-else
            :schema="supportRequestSchema"
            :state="state"
            class="space-y-4"
            @submit="onSubmit"
          >
            <div>
              <p class="text-sm font-medium text-default">
                From
              </p>
              <p class="mt-1 text-body-sm text-highlighted">
                {{ user?.name ? `${user.name} · ${user.email}` : user?.email }}
              </p>
              <p class="mono-meta mt-0.5">
                Replies go to this address
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="Topic"
                name="topic"
              >
                <USelect
                  v-model="state.topic"
                  :items="topicItems"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                v-if="myTenants.length"
                label="Account"
              >
                <USelect
                  v-model="state.account"
                  :items="accountItems"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              label="Subject"
              name="subject"
            >
              <UInput
                v-model="state.subject"
                class="w-full"
                maxlength="200"
              />
            </UFormField>

            <UFormField
              label="Message"
              name="message"
            >
              <UTextarea
                v-model="state.message"
                :rows="6"
                autoresize
                class="w-full"
                maxlength="5000"
              />
            </UFormField>

            <UAlert
              v-if="error"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
              :description="error"
            />

            <UButton
              type="submit"
              label="Send message"
              icon="i-lucide-send"
              :loading="loading"
            />
          </UForm>
        </UCard>
      </section>

      <aside aria-labelledby="support-contacts-heading">
        <SectionKicker
          number="02"
          label="Other ways to reach us"
          class="mb-3"
        />
        <h2
          id="support-contacts-heading"
          class="sr-only"
        >
          Other ways to reach us
        </h2>

        <ul>
          <li
            v-for="contact in contacts"
            :key="contact.title"
            class="flex items-start gap-4 border-b border-muted py-5 first:pt-2"
          >
            <IconTile :icon="contact.icon" />
            <div class="min-w-0">
              <h3 class="text-body-lg text-highlighted">
                {{ contact.title }}
              </h3>
              <a
                :href="`mailto:${contact.email}`"
                class="mt-1 block truncate text-body-sm text-default underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >{{ contact.email }}</a>
              <a
                :href="telHref(contact.phone)"
                class="mono-meta mt-1 block hover:text-default"
              >{{ contact.phone }}</a>
            </div>
          </li>
        </ul>

        <AsideNote class="mt-5">
          For urgent changes to how your calls are handled, call Customer Service.
        </AsideNote>
      </aside>
    </div>
  </div>
</template>

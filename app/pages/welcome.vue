<script setup lang="ts">
// How people moving from the old Insight (insight.answerunited.com, email and
// password only) sign in for the first time. Public, so the sign-in page, the
// go-live email and the old site's redirect can all point here.
definePageMeta({ layout: 'legal', auth: false })
useSeoMeta({
  title: 'Signing in to the new Insight',
  description: 'How to sign in to the new Insight for the first time, with an emailed link.'
})

const SAMPLE_CODE = ['4', '8', '2', '9', '1', '3']

function printSteps() {
  window.print()
}
</script>

<template>
  <article>
    <PageHeader
      kicker="Welcome"
      title="Signing in to the new Insight"
      description="Insight has a new home and a new way to sign in. It takes about a minute."
    />

    <div class="legal-prose mt-8">
      <p>
        Insight now lives at <strong>insight.answerunited.net</strong>. The old address forwards there, so your bookmarks still work. Your account, messages and call recordings are already set up.
      </p>
      <p>
        <strong>Your old password doesn’t carry over.</strong> The first time, you sign in with a link we email you. After that you can set a new password, or keep using emailed links.
      </p>
    </div>

    <ol class="mt-12 space-y-12">
      <li class="grid gap-5 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <SectionKicker
            number="01"
            label="Enter your email"
            :hairline="false"
          />
          <p class="mt-3 text-body text-toned">
            Go to <ULink
              to="/login"
              class="text-cobalt-text underline underline-offset-3"
            >insight.answerunited.net</ULink> and enter the email address you used with the old Insight.
          </p>
        </div>
        <WelcomeMockFrame>
          <p class="text-[13px] font-medium text-default">
            Email
          </p>
          <div class="mt-1.5 rounded-standard border border-cobalt-border bg-default px-3 py-2 text-[13px] text-highlighted">
            you@yourcompany.com
          </div>
          <p class="mt-3 text-[13px] font-medium text-dimmed">
            Password
          </p>
          <div class="mt-1.5 h-[34px] rounded-standard border border-default bg-default opacity-50" />
        </WelcomeMockFrame>
      </li>

      <li class="grid gap-5 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <SectionKicker
            number="02"
            label="Ask for a sign-in link"
            :hairline="false"
          />
          <p class="mt-3 text-body text-toned">
            Leave the password empty and choose <strong class="text-highlighted">Email me a sign-in link</strong>. Typing your old password won’t work.
          </p>
        </div>
        <WelcomeMockFrame>
          <div class="flex items-center gap-3">
            <span class="hairline" />
            <span class="mono-meta">or</span>
            <span class="hairline" />
          </div>
          <div class="mt-3 flex items-center justify-center gap-2 rounded-standard border-2 border-primary bg-default px-3 py-2 text-[14px] font-medium text-highlighted ring-4 ring-cobalt-bg">
            <UIcon
              name="i-lucide-mail"
              class="size-4"
            />
            Email me a sign-in link
          </div>
          <div class="mt-2 flex items-center justify-center gap-2 rounded-standard border border-default bg-default px-3 py-2 text-[14px] text-muted opacity-50">
            <UIcon
              name="i-lucide-key-round"
              class="size-4"
            />
            Sign in with a passkey
          </div>
        </WelcomeMockFrame>
      </li>

      <li class="grid gap-5 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <SectionKicker
            number="03"
            label="Open the email"
            :hairline="false"
          />
          <p class="mt-3 text-body text-toned">
            Within a minute you’ll get an email from <strong class="text-highlighted">no-reply@answerunited.com</strong> titled “Your Insight sign-in code”. Then either:
          </p>
          <ul class="mt-3 list-disc space-y-1.5 pl-5 text-body text-toned marker:text-dimmed">
            <li>click <strong class="text-highlighted">Sign in to Insight</strong>, then <strong class="text-highlighted">Continue to Insight</strong> on the page that opens, or</li>
            <li>type the 6-digit code on the sign-in page, which will be waiting for it.</li>
          </ul>
          <p class="mt-3 text-body text-toned">
            The link and code work once and expire after 15 minutes.
          </p>
        </div>
        <WelcomeMockFrame>
          <p class="mono-meta">
            From: Insight
          </p>
          <p class="mt-1 text-[14px] font-medium text-highlighted">
            Your Insight sign-in code: 482913
          </p>
          <div class="hairline my-3 w-full" />
          <p class="text-[13px] text-toned">
            Click the button below to sign in to Insight.
          </p>
          <div class="mt-3 inline-flex rounded-standard bg-primary px-4 py-2 text-[13px] font-medium text-inverted">
            Sign in to Insight
          </div>
          <p class="mt-3 text-[13px] text-toned">
            Or enter this code on the sign-in page:
          </p>
          <p class="mt-1 text-[22px] font-bold tracking-[0.25em] text-highlighted tabular-nums">
            482913
          </p>
        </WelcomeMockFrame>
      </li>

      <li class="grid gap-5 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <SectionKicker
            number="04"
            label="You’re in"
            :hairline="false"
          />
          <p class="mt-3 text-body text-toned">
            If you typed the code, you’re signed in right away. If you clicked the link, choose <strong class="text-highlighted">Continue to Insight</strong> to finish. You’ll land on your account’s messages and recordings.
          </p>
        </div>
        <div class="grid gap-3">
          <WelcomeMockFrame caption="After clicking the link">
            <p class="font-display text-[18px] text-highlighted">
              One more click.
            </p>
            <div class="mt-3 rounded-standard bg-primary px-3 py-2 text-center text-[13px] font-medium text-inverted">
              Continue to Insight
            </div>
          </WelcomeMockFrame>
          <WelcomeMockFrame caption="Or type the code">
            <div class="flex justify-center gap-1.5">
              <span
                v-for="(digit, index) in SAMPLE_CODE"
                :key="index"
                class="grid size-8 place-items-center rounded-standard border border-default bg-default text-[14px] font-medium text-highlighted tabular-nums"
              >{{ digit }}</span>
            </div>
          </WelcomeMockFrame>
        </div>
      </li>

      <li class="grid gap-5 break-inside-avoid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
        <div>
          <SectionKicker
            number="05"
            label="Next time (optional)"
            :hairline="false"
          />
          <p class="mt-3 text-body text-toned">
            Emailed links work every time, so you can stop here. To skip the email, open <strong class="text-highlighted">Account</strong> (your initials at the bottom left, or the Account tab on a phone) and either:
          </p>
          <ul class="mt-3 list-disc space-y-1.5 pl-5 text-body text-toned marker:text-dimmed">
            <li><strong class="text-highlighted">set a password</strong>, at least 10 characters, or</li>
            <li><strong class="text-highlighted">add a passkey</strong>, to sign in with your fingerprint, face or device PIN.</li>
          </ul>
        </div>
        <div class="grid gap-4">
          <div class="flex items-start gap-3">
            <IconTile icon="i-lucide-lock-keyhole" />
            <p class="text-body-sm text-muted">
              A password works like before: email and password, then <strong class="text-default">Sign in</strong>.
            </p>
          </div>
          <div class="flex items-start gap-3">
            <IconTile icon="i-lucide-fingerprint" />
            <p class="text-body-sm text-muted">
              A passkey is the quickest: choose <strong class="text-default">Sign in with a passkey</strong>.
            </p>
          </div>
        </div>
      </li>
    </ol>

    <div class="legal-prose mt-14">
      <h2>If something goes wrong</h2>
      <ul>
        <li><strong>No email after a few minutes?</strong> Check your spam or junk folder, then go back and choose <em>Resend</em>. Only the newest email works, so use the latest one.</li>
        <li><strong>“Invalid email or password”?</strong> That means you typed a password. Leave it empty and choose <em>Email me a sign-in link</em> instead.</li>
        <li><strong>The link says it has expired?</strong> Links and codes last 15 minutes and work once. Ask for a new one from the sign-in page.</li>
        <li><strong>Not sure which email address you used, or still stuck?</strong> Call Answer United at <a href="tel:+18002590135">(800) 259-0135</a> or email <a href="mailto:custserv@answerunited.com">custserv@answerunited.com</a>.</li>
      </ul>

      <h2>What’s new</h2>
      <ul>
        <li>Messages and call recordings for your account, in one place, on any device.</li>
        <li>Choose your own columns, sort by any of them, and export messages to a spreadsheet.</li>
        <li>Sign in with an emailed link, a password or a passkey.</li>
        <li>Set your own timezone on your Account page.</li>
      </ul>
    </div>

    <div class="mt-12 flex flex-wrap items-center gap-3 print:hidden">
      <UButton
        label="Go to sign in"
        icon="i-lucide-arrow-right"
        trailing
        to="/login"
      />
      <UButton
        label="Print these steps"
        icon="i-lucide-printer"
        color="neutral"
        variant="outline"
        @click="printSteps"
      />
    </div>
  </article>
</template>

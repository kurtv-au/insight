<script setup lang="ts">
const { loggedIn } = useUserSession()
</script>

<template>
  <div class="min-h-dvh bg-default text-default">
    <header class="mx-auto flex w-full max-w-[760px] items-center justify-between gap-4 px-6 pt-8 sm:px-8">
      <NuxtLink
        to="/"
        aria-label="Insight home"
      >
        <AppLogo
          :width="150"
          label="Insight"
        />
      </NuxtLink>
      <UButton
        :label="loggedIn ? 'Back to Insight' : 'Sign in'"
        :to="loggedIn ? '/' : '/login'"
        color="neutral"
        variant="outline"
        size="sm"
      />
    </header>

    <main class="mx-auto w-full max-w-[760px] px-6 pt-14 pb-16 sm:px-8">
      <slot />
    </main>

    <footer class="mx-auto flex w-full max-w-[760px] flex-wrap items-center justify-between gap-3 border-t border-muted px-6 py-8 sm:px-8">
      <p class="mono-meta">
        © {{ new Date().getFullYear() }} Answer United, Inc.
      </p>
      <LegalLinks />
    </footer>
  </div>
</template>

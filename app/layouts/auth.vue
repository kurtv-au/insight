<template>
  <div class="relative grid min-h-dvh place-items-center overflow-hidden bg-default px-4 py-16 text-default">
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-radial-[ellipse_60%_100%_at_50%_100%] from-cobalt-bg to-transparent"
      aria-hidden="true"
    />

    <div class="relative w-full max-w-sm">
      <NuxtLink
        to="/"
        class="mb-10 flex justify-center"
      >
        <AppLogo
          label="Insight"
          align="center"
        />
      </NuxtLink>

      <div class="rounded-elevated border border-default bg-muted/80 p-6 shadow-xl backdrop-blur sm:p-8 dark:bg-elevated/60">
        <slot />
      </div>

      <div class="mt-6 flex flex-col items-center gap-2">
        <p class="mono-meta">
          © {{ new Date().getFullYear() }} Answer United, Inc.
        </p>
        <LegalLinks />
      </div>
    </div>
  </div>
</template>

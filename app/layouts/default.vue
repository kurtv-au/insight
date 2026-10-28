<template>
  <div class="min-h-dvh bg-default text-default">
    <AppRail />
    <main class="min-h-dvh pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-16">
      <slot />
    </main>
    <AppTabbar />
  </div>
</template>

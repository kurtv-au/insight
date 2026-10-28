<script setup lang="ts">
// The recording's waveform as a seek bar: the played part fills in as it plays,
// and clicking or dragging anywhere on it seeks there.
const props = defineProps<{
  /** Loudness per bar, 0–1. Null while loading, or empty if unavailable: bars are drawn flat. */
  peaks: number[] | null | undefined
  current: number
  duration: number
  disabled?: boolean
}>()

const emit = defineEmits<{
  /** While dragging */
  scrub: [seconds: number]
  /** On release, click or key press */
  seek: [seconds: number]
}>()

const FLAT_BARS = 72
const KEY_STEP = 5

const track = useTemplateRef<HTMLDivElement>('track')
const dragging = ref(false)
const hover = ref<number | null>(null)

const bars = computed(() => props.peaks?.length ? props.peaks : Array.from({ length: FLAT_BARS }, () => 0))
const progress = computed(() => props.duration ? Math.min(100, props.current / props.duration * 100) : 0)

function timeAt(event: PointerEvent) {
  const rect = track.value!.getBoundingClientRect()
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * props.duration
}

function onPointerDown(event: PointerEvent) {
  if (props.disabled || event.button !== 0) {
    return
  }
  track.value!.setPointerCapture(event.pointerId)
  dragging.value = true
  emit('scrub', timeAt(event))
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) {
    emit('scrub', timeAt(event))
  } else if (event.pointerType === 'mouse' && !props.disabled) {
    hover.value = timeAt(event) / props.duration * 100
  }
}

function onPointerUp(event: PointerEvent) {
  if (dragging.value) {
    dragging.value = false
    emit('seek', timeAt(event))
  }
}

const KEYS: Record<string, (current: number) => number> = {
  ArrowLeft: current => current - KEY_STEP,
  ArrowDown: current => current - KEY_STEP,
  ArrowRight: current => current + KEY_STEP,
  ArrowUp: current => current + KEY_STEP,
  Home: () => 0,
  End: () => props.duration
}

function onKeyDown(event: KeyboardEvent) {
  const target = KEYS[event.key]
  if (target && !props.disabled) {
    event.preventDefault()
    emit('seek', Math.max(0, Math.min(props.duration, target(props.current))))
  }
}
</script>

<template>
  <div
    ref="track"
    role="slider"
    :tabindex="disabled ? -1 : 0"
    aria-label="Seek"
    :aria-disabled="disabled"
    :aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(current)"
    :aria-valuetext="`${formatDuration(current)} of ${formatDuration(duration)}`"
    class="relative h-16 touch-none rounded-sm outline-offset-4 select-none focus-visible:outline-2 focus-visible:outline-primary"
    :class="disabled ? 'opacity-60' : 'cursor-pointer'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @pointerleave="hover = null"
    @keydown="onKeyDown"
  >
    <!-- Unplayed bars, with a played copy clipped over them. Only the clip changes
         as it plays; the bars themselves re-render only when the peaks change. -->
    <div
      v-memo="[bars]"
      class="absolute inset-0 flex items-center gap-0.5"
      aria-hidden="true"
    >
      <span
        v-for="(peak, index) in bars"
        :key="index"
        class="min-h-0.5 flex-1 rounded-full bg-accented"
        :style="{ height: `${peak * 100}%` }"
      />
    </div>
    <div
      class="absolute inset-0"
      :style="{ clipPath: `inset(0 ${100 - progress}% 0 0)` }"
      aria-hidden="true"
    >
      <div
        v-memo="[bars]"
        class="flex h-full items-center gap-0.5"
      >
        <span
          v-for="(peak, index) in bars"
          :key="index"
          class="min-h-0.5 flex-1 rounded-full bg-primary"
          :style="{ height: `${peak * 100}%` }"
        />
      </div>
    </div>

    <div
      v-if="hover !== null && !dragging"
      class="pointer-events-none absolute inset-y-0 w-px bg-primary/40"
      :style="{ left: `${hover}%` }"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-primary"
      :style="{ left: `${progress}%` }"
      aria-hidden="true"
    />
  </div>
</template>

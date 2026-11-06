<script setup lang="ts">
// Custom controls over a plain <audio> element. There are no native controls, so
// the browser's download option isn't offered (recordings are listen-only).
const props = defineProps<{
  src: string
  autoplay?: boolean
}>()

const SPEEDS = [1, 1.25, 1.5, 2]
const WAVEFORM_BARS = 72

const audio = useTemplateRef<HTMLAudioElement>('audio')
const playing = ref(false)
const loading = ref(true)
const failed = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const speed = ref(1)
// While dragging, the waveform shows the drag position instead of the playhead
const scrubbing = ref<number | null>(null)
const position = computed(() => scrubbing.value ?? currentTime.value)

// The waveform is drawn from the audio itself. A flat one shows until it's ready,
// or if the browser can't decode it.
const peaks = ref<number[] | null>(null)
async function loadWaveform(src: string) {
  peaks.value = null
  let result: number[] = []
  try {
    result = await audioPeaks(await $fetch<ArrayBuffer>(src, { responseType: 'arrayBuffer' }), WAVEFORM_BARS)
  } catch {
    // Leave it flat
  }
  // A newer recording may have replaced this one meanwhile
  if (src === props.src) {
    peaks.value = result
  }
}
onMounted(() => loadWaveform(props.src))
watch(() => props.src, loadWaveform)

function reset() {
  playing.value = false
  loading.value = true
  failed.value = false
  currentTime.value = 0
  duration.value = 0
  scrubbing.value = null
}

async function play() {
  try {
    await audio.value?.play()
  } catch {
    // Autoplay can be blocked; the play button still works
    playing.value = false
  }
}

function stop() {
  audio.value?.pause()
}

function toggle() {
  if (audio.value?.paused) {
    play()
  } else {
    stop()
  }
}

function seek(seconds: number) {
  if (audio.value) {
    audio.value.currentTime = Math.max(0, Math.min(seconds, duration.value || seconds))
    currentTime.value = audio.value.currentTime
  }
}

function onSeek(seconds: number) {
  seek(seconds)
  scrubbing.value = null
}

// timeupdate only fires a few times a second, so follow the playhead every frame
// while playing to keep the waveform moving smoothly
let frame = 0
function follow() {
  currentTime.value = audio.value?.currentTime ?? 0
  frame = requestAnimationFrame(follow)
}

function onPlay() {
  playing.value = true
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(follow)
}

function onPause() {
  playing.value = false
  cancelAnimationFrame(frame)
  currentTime.value = audio.value?.currentTime ?? 0
}

function cycleSpeed() {
  speed.value = SPEEDS[(SPEEDS.indexOf(speed.value) + 1) % SPEEDS.length]!
  if (audio.value) {
    audio.value.playbackRate = speed.value
  }
}

function onLoaded() {
  loading.value = false
  duration.value = audio.value?.duration ?? 0
  if (audio.value) {
    audio.value.playbackRate = speed.value
  }
  if (props.autoplay) {
    play()
  }
}

watch(() => props.src, reset)

// A detached <audio> can keep playing, so stop it when the drawer closes
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  stop()
})

defineExpose({ play, stop, toggle })
</script>

<template>
  <div class="rounded-standard border border-default bg-muted p-4">
    <audio
      ref="audio"
      :src="src"
      preload="metadata"
      @loadedmetadata="onLoaded"
      @play="onPlay"
      @pause="onPause"
      @ended="onPause"
      @timeupdate="currentTime = audio?.currentTime ?? 0"
      @error="failed = true; loading = false"
      @contextmenu.prevent
    />

    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      description="This recording couldn’t be loaded. Please try again, or contact support if it keeps happening."
    />

    <template v-else>
      <RecordingWaveform
        :peaks="peaks"
        :current="position"
        :duration="duration"
        :disabled="loading"
        @scrub="scrubbing = $event"
        @seek="onSeek"
      />

      <div class="mt-4 flex items-center gap-3">
        <UButton
          :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
          :aria-label="playing ? 'Pause' : 'Play'"
          :loading="loading"
          size="lg"
          class="rounded-full"
          square
          @click="toggle"
        />
        <p class="mono-meta whitespace-nowrap tabular-nums">
          {{ formatDuration(position) }} / {{ duration ? formatDuration(duration) : '–:––' }}
        </p>
        <div class="ml-auto flex items-center gap-1">
          <UButton
            icon="i-lucide-rotate-ccw"
            label="15s"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Back 15 seconds"
            :disabled="loading"
            @click="seek(currentTime - 15)"
          />
          <UButton
            icon="i-lucide-rotate-cw"
            label="15s"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Forward 15 seconds"
            :disabled="loading"
            @click="seek(currentTime + 15)"
          />
          <UButton
            :label="`${speed}×`"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-w-12 justify-center tabular-nums"
            :aria-label="`Playback speed ${speed}×`"
            @click="cycleSpeed"
          />
        </div>
      </div>
    </template>
  </div>
</template>

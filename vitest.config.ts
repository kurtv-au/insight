import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests only: plain Node, no Nuxt runtime and no database. Shared modules
// are imported by relative path; server handlers get their Nitro auto-imports
// stubbed per test (see test/unit/*.auth.test.ts).
export default defineConfig({
  resolve: {
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    env: { TZ: 'UTC' }
  }
})

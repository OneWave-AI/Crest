import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // electron-vite owns the build; this config exists only for tests.
    restoreMocks: true
  }
})

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_PATH: ':memory:',
    },
    pool: 'forks',
    testTimeout: 10_000,
    fileParallelism: false,
  },
})

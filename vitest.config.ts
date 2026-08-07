import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// vite.config.ts は環境変数 NOVEL を要求するため、テストは config を分ける
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
  },
})

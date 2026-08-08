import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// vite.config.ts は環境変数 NOVEL を要求するため、テストは config を分ける
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // tests/e2e/ は Playwright の担当。ここに .test.ts を置いても Vitest は拾わない
    exclude: ['tests/e2e/**'],
    environment: 'node',
  },
  resolve: {
    alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
  },
})

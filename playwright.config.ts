import { defineConfig } from '@playwright/test'

/**
 * コアは Vitest で検証できるが、背景・立ち絵・音声・ページ分割は DOM でしか確認できない。
 * ここは **DOM の値を assert するテストだけ** を置く。
 * スクリーンショット比較は壊れやすく、維持コストが実利を上回るため採らない。
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: 'NOVEL=kieta-ippen npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})

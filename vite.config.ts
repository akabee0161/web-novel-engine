import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { resolveAssetsDir } from './tools/wn-compile/config.ts'
import { wnCompile } from './tools/wn-compile/index.ts'

export default defineConfig(() => {
  const novel = process.env.NOVEL
  if (!novel) {
    throw new Error(
      '環境変数 NOVEL に作品ディレクトリ名を指定してください（例: NOVEL=kieta-ippen npm run dev）',
    )
  }
  const root = resolve(import.meta.dirname, 'novels', novel)
  // 素材の置き場所は作品ごとに差し替えられる。既定は <作品ディレクトリ>/public
  const assetsDir = resolveAssetsDir(root)
  return {
    root,
    base: './',
    publicDir: assetsDir,
    build: {
      outDir: resolve(import.meta.dirname, 'dist', novel),
      emptyOutDir: true,
    },
    resolve: {
      alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
    },
    plugins: [react(), wnCompile({ assetsDir })],
  }
})

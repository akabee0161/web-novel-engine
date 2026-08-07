import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
// import { wnCompile } from './tools/wn-compile/index.ts'   // Task 4 で有効化する

export default defineConfig(() => {
  const novel = process.env.NOVEL
  if (!novel) {
    throw new Error(
      '環境変数 NOVEL に作品ディレクトリ名を指定してください（例: NOVEL=kieta-ippen npm run dev）',
    )
  }
  const root = resolve(import.meta.dirname, 'novels', novel)
  return {
    root,
    base: './',
    build: {
      outDir: resolve(import.meta.dirname, 'dist', novel),
      emptyOutDir: true,
    },
    resolve: {
      alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
    },
    plugins: [react() /* , wnCompile({ root }) */],
  }
})

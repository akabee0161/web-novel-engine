import { createRoot } from 'react-dom/client'
import { WebAudio } from '../core/audio.ts'
import type { CompiledScript } from '../core/script.ts'
import { Runtime } from '../core/runtime.ts'
import { browserStorage } from '../core/storage.ts'
import { App } from './App.tsx'
import './style.css'

export type BootOptions = {
  mount: HTMLElement
  script: CompiledScript
  /** ストレージキー `wn:<作品ID>:*` になる。ディレクトリ名から拾わず作品側が明示的に渡す */
  novelId: string
}

export function boot(opts: BootOptions): void {
  // 素材のパス解決の基準。コアは DOM を触れないのでここで渡す
  const baseUrl = document.baseURI
  // WebAudio は Runtime のコンストラクタ引数なので、runtime.resolveAsset は渡せない
  // （その時点で Runtime がまだ存在しない）。assets から直接引いて循環を避ける
  const resolve = (key: string): string | null => {
    const rel = opts.script.assets[key]
    return rel ? new URL(rel, baseUrl).href : null
  }
  const runtime = new Runtime({
    script: opts.script,
    novelId: opts.novelId,
    baseUrl,
    audio: new WebAudio(resolve),
    storage: browserStorage(),
    onSaveable: () => {
      // セーブ可能点に到達するたびに打つ。定義がそのままタイミングになるので、
      // 「フェード中にオートセーブを打たない」が構造的に満たされる
      try {
        runtime.saveTo('auto')
      } catch (e) {
        console.warn('オートセーブに失敗した', e)
      }
    },
  })

  // 本文を測れる UI が繋がるので、ここでページ分割を有効にする。
  // MessageBox の効果で有効化すると、最初の1ブロックだけ測定前に流れてしまう
  runtime.enablePagination()

  // 既読は本文1ブロックごとに増える。1ブロックごとに localStorage を触ると
  // 文字送りと同じ頻度で同期 I/O が走るため、まとめて書き出す
  const timer = setInterval(() => runtime.flushSystem(), 5000)
  addEventListener('pagehide', () => {
    clearInterval(timer)
    runtime.flushSystem()
  })

  createRoot(opts.mount).render(<App runtime={runtime} />)
}

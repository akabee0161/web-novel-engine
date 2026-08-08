import { createRoot } from 'react-dom/client'
import { WebAudio } from '../core/audio.ts'
import type { CompiledScript } from '../core/script.ts'
import { Runtime } from '../core/runtime.ts'
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
  })
  createRoot(opts.mount).render(<App runtime={runtime} />)
}

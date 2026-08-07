import { createRoot } from 'react-dom/client'
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
  const runtime = new Runtime({
    script: opts.script,
    novelId: opts.novelId,
    // 素材のパス解決の基準。コアは DOM を触れないのでここで渡す
    baseUrl: document.baseURI,
  })
  createRoot(opts.mount).render(<App runtime={runtime} />)
}

import type { CompiledScript } from './core/script.ts'

/** 作品が触ってよい唯一の入口 */
export type BootOptions = {
  mount: HTMLElement
  script: CompiledScript
  /** ストレージキー `wn:<作品ID>:*` になる。ディレクトリ名から拾わず作品側が明示的に渡す */
  novelId: string
}

export function boot(opts: BootOptions): void {
  throw new Error(`boot() は未実装（実装計画の Task 7）: ${opts.novelId}`)
}

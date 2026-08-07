import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { CompiledScript, Scene, Step } from '../../src/engine/core/script.ts'
import { scanAssets } from './assets.ts'
import { parse, WnError, type RawStep } from './parse.ts'

/** engine-spec の定義: シーン名 \n 話者名 \n 本文 を SHA-256、先頭12桁 */
function hash(sceneId: string, speaker: string | null, body: string): string {
  return createHash('sha256')
    .update(`${sceneId}\n${speaker ?? ''}\n${body}`, 'utf8')
    .digest('hex')
    .slice(0, 12)
}

/**
 * 台本が参照している素材が assets に存在するか確かめる。
 *
 * RawStep は行番号を保持していないため、エラーは file:1 を指す。行番号まで出すには
 * 全 step に行番号を持たせる必要があり、実行時に不要な情報が載る。
 * 素材名はメッセージに出るので、どの行かは検索すれば分かる。この妥協は意図的なもの。
 */
function checkAssets(scenes: { steps: RawStep[] }[], assets: Record<string, string>, file: string) {
  const missing = (key: string) => {
    if (!(key in assets)) throw new WnError(file, 1, `素材が見つからない: ${key}`)
  }
  for (const scene of scenes) {
    for (const step of scene.steps) {
      switch (step.t) {
        case 'bg':
          missing(`bg/${step.name}`)
          break
        case 'bgm':
          missing(`bgm/${step.name}`)
          break
        case 'se':
          missing(`se/${step.name}`)
          break
        case 'show':
          // 表情を省略した @show は、その時点の表情がビルド時に確定しないため検査しない
          if (step.expr) missing(`chara/${step.id}_${step.expr}`)
          break
      }
    }
  }
}

export function compile(source: string, file: string, publicDir: string): CompiledScript {
  const raw = parse(source, file)
  const assets = scanAssets(publicDir)
  checkAssets(raw.scenes, assets, file)

  const scenes: Scene[] = raw.scenes.map((scene) => ({
    id: scene.id,
    steps: scene.steps.map((step): Step =>
      step.t === 'text' ? { ...step, h: hash(scene.id, step.speaker, step.body) } : step,
    ),
  }))

  return { title: raw.title, protagonist: raw.protagonist, scenes, assets }
}

export function wnCompile(opts: { root: string }): Plugin {
  return {
    name: 'wn-compile',
    transform(code, id) {
      if (!id.endsWith('.wn')) return
      const script = compile(code, id, join(opts.root, 'public'))
      return { code: `export default ${JSON.stringify(script)}`, map: null }
    },
  }
}

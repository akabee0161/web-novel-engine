import type { Step } from '../../src/engine/core/script.ts'

/** ハッシュを埋める前の中間表現。`h` だけが欠けている */
export type RawStep =
  | Omit<Extract<Step, { t: 'text' }>, 'h'>
  | Exclude<Step, { t: 'text' }>

export type RawScene = { id: string; steps: RawStep[] }

export type ParseResult = {
  title: string
  protagonist: string | null
  scenes: RawScene[]
}

export class WnError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`)
    this.name = 'WnError'
  }
}

const DEFAULT_SCENE_ID = '（無題）'

export function parse(source: string, file: string): ParseResult {
  const scenes: RawScene[] = []
  const seen = new Set<string>()
  // Task 3 で @title / @protagonist が代入する
  const title = ''
  const protagonist: string | null = null
  let current: RawScene | null = null
  let index = 0 // シーン内の本文ブロック連番
  let speaker: string | null = null
  let hasSpeaker = false // 直前の行が `>` だったか

  /** シーン宣言が1つも無い台本のために、本文が来た時点で暗黙のシーンを作る */
  const scene = (): RawScene => {
    if (!current) {
      current = { id: DEFAULT_SCENE_ID, steps: [] }
      scenes.push(current)
      seen.add(DEFAULT_SCENE_ID)
    }
    return current
  }

  const lines = source.split(/\r?\n/)
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim()
    const lineNo = n + 1

    if (line === '' || line.startsWith('#')) continue

    if (line.startsWith('=')) {
      const rest = line.slice(1).trim()
      const m = /^scene\s+(.+)$/.exec(rest)
      if (!m) throw new WnError(file, lineNo, `シーン宣言は '= scene <名前>' と書く: ${line}`)
      const id = m[1].trim()
      if (seen.has(id)) throw new WnError(file, lineNo, `シーン名が重複している: ${id}`)
      seen.add(id)
      current = { id, steps: [] }
      scenes.push(current)
      index = 0
      hasSpeaker = false
      speaker = null
      continue
    }

    if (line.startsWith('>')) {
      speaker = line.slice(1).trim() || null
      hasSpeaker = true
      continue
    }

    if (line.startsWith('@')) {
      // Task 3 で実装する
      continue
    }

    scene().steps.push({ t: 'text', i: index++, speaker: hasSpeaker ? speaker : null, body: line })
    hasSpeaker = false
    speaker = null
  }

  return { title, protagonist, scenes }
}

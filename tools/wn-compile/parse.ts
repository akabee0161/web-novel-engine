import type { Pos, Step } from '../../src/engine/core/script.ts'

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
  let title = ''
  let protagonist: string | null = null
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
      const sp = line.search(/\s/)
      const cmd = (sp < 0 ? line : line.slice(0, sp)).slice(1)
      const rest = sp < 0 ? '' : line.slice(sp + 1).trim()
      const a = splitArgs(rest)
      const need = (what: string): string => {
        if (a.pos.length === 0) throw new WnError(file, lineNo, `@${cmd} は${what}が要る`)
        return a.pos[0]
      }

      switch (cmd) {
        case 'title':
          if (rest === '') throw new WnError(file, lineNo, '@title はタイトル文字列が要る')
          title = rest
          break

        case 'protagonist':
          if (rest === '') throw new WnError(file, lineNo, '@protagonist は表示名が要る')
          protagonist = rest
          break

        case 'bg':
          scene().steps.push({
            t: 'bg',
            name: need('背景名'),
            fade: readMs(a, 'fade', file, lineNo, '@bg'),
          })
          break

        case 'bgm': {
          const name = need('BGM 名か stop')
          if (name === 'stop') {
            scene().steps.push({ t: 'bgmStop', fade: readMs(a, 'fade', file, lineNo, '@bgm stop') })
          } else {
            scene().steps.push({ t: 'bgm', name })
          }
          break
        }

        case 'se':
          scene().steps.push({ t: 'se', name: need('効果音名') })
          break

        case 'show':
          scene().steps.push({
            t: 'show',
            id: need('キャラ名'),
            expr: a.pos[1] ?? null,
            pos: readPos(a, file, lineNo),
          })
          break

        case 'hide': {
          const id = need('キャラ名か *')
          scene().steps.push({ t: 'hide', id: id === '*' ? null : id })
          break
        }

        // @wait だけ位置引数がミリ秒なので readMs を通さず個別に検証する
        case 'wait': {
          const ms = need('ミリ秒')
          if (!/^\d+$/.test(ms)) {
            throw new WnError(file, lineNo, `@wait はミリ秒（整数）が要る: ${ms}`)
          }
          scene().steps.push({ t: 'wait', ms: Number(ms) })
          break
        }

        case 'speed': {
          const v = need('slow か normal')
          if (v !== 'slow' && v !== 'normal') {
            throw new WnError(file, lineNo, `@speed は slow か normal: ${v}`)
          }
          scene().steps.push({ t: 'speed', value: v })
          break
        }

        case 'flashback': {
          const v = need('on か off')
          if (v !== 'on' && v !== 'off') {
            throw new WnError(file, lineNo, `@flashback は on か off: ${v}`)
          }
          scene().steps.push({ t: 'flashback', on: v === 'on' })
          break
        }

        default:
          throw new WnError(file, lineNo, `未知の命令: @${cmd}`)
      }
      continue
    }

    scene().steps.push({ t: 'text', i: index++, speaker: hasSpeaker ? speaker : null, body: line })
    hasSpeaker = false
    speaker = null
  }

  return { title, protagonist, scenes }
}

type Args = {
  /** 位置引数（key:value を除いたもの） */
  pos: string[]
  /** key:value 形式の引数 */
  named: Map<string, string>
}

function splitArgs(rest: string): Args {
  const pos: string[] = []
  const named = new Map<string, string>()
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    const at = tok.indexOf(':')
    if (at > 0) named.set(tok.slice(0, at), tok.slice(at + 1))
    else pos.push(tok)
  }
  return { pos, named }
}

function readMs(a: Args, key: string, file: string, line: number, cmd: string): number {
  const raw = a.named.get(key)
  if (raw === undefined) return 0
  if (!/^\d+$/.test(raw)) {
    throw new WnError(file, line, `${cmd} の ${key} はミリ秒（整数）が要る: ${raw}`)
  }
  return Number(raw)
}

function readPos(a: Args, file: string, line: number): Pos | null {
  const raw = a.named.get('pos')
  if (raw === undefined) return null
  if (raw !== 'left' && raw !== 'center' && raw !== 'right') {
    throw new WnError(file, line, `pos は left / center / right のどれか: ${raw}`)
  }
  return raw
}

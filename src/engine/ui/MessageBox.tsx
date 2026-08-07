import type { CompiledScript } from '../core/script.ts'
import type { EngineState } from '../core/state.ts'

type Props = {
  state: EngineState
  script: CompiledScript
}

export function MessageBox({ state, script }: Props) {
  const text = state.view.currentText
  if (!text) return null

  // 話者未指定の「…」で始まる行は主人公の発話。ネームプレートに @protagonist を出す
  // （script-syntax の「記号なしの行は出さない / 「…」は @protagonist の名前」）
  const isProtagonistLine = text.speaker === null && text.body.startsWith('「')
  const name = text.speaker ?? (isProtagonistLine ? script.protagonist : null)

  return (
    <div className="wn-messagebox">
      {name && <div className="wn-speaker">{name}</div>}
      <div>{text.body.slice(0, state.view.visibleChars)}</div>
    </div>
  )
}

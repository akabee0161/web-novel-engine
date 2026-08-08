import type { CompiledScript } from '../core/script.ts'
import type { EngineState } from '../core/state.ts'
import { displayName } from './speaker.ts'

type Props = {
  state: EngineState
  script: CompiledScript
}

export function MessageBox({ state, script }: Props) {
  const text = state.view.currentText
  if (!text) return null

  const name = displayName(text, script.protagonist)

  return (
    <div className="wn-messagebox">
      {name && <div className="wn-speaker">{name}</div>}
      <div>{text.body.slice(0, state.view.visibleChars)}</div>
    </div>
  )
}

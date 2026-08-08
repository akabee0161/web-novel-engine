import type { CompiledScript } from '../core/script.ts'
import type { BacklogEntry } from '../core/state.ts'
import { displayName } from './speaker.ts'

type Props = {
  entries: readonly BacklogEntry[]
  script: CompiledScript
  onClose: () => void
}

/** 読み返しのみ。行をクリックしても進行位置は動かない */
export function Backlog({ entries, script, onClose }: Props) {
  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>バックログ</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>
        <div className="wn-backlog-list">
          {entries.map((entry, n) => {
            const name = displayName(entry, script.protagonist)
            return (
              <p key={n} className="wn-backlog-item">
                {name && <span className="wn-backlog-name">{name}</span>}
                {entry.body}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}

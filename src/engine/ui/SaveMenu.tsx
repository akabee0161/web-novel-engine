import type { SaveMeta } from '../core/save.ts'

type Props = {
  mode: 'save' | 'load'
  slots: readonly string[]
  saves: SaveMeta[]
  onPick: (slot: string) => void
  onClose: () => void
}

const SLOT_LABEL: Record<string, string> = { auto: 'オート' }

export function SaveMenu({ mode, slots, saves, onPick, onClose }: Props) {
  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>{mode === 'save' ? 'セーブ' : 'ロード'}</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>
        <div className="wn-slots">
          {slots.map((slot) => {
            const meta = saves.find((s) => s.slot === slot)
            // オートセーブへの手動保存はさせない
            const disabled = mode === 'save' ? slot === 'auto' : !meta
            return (
              <button
                key={slot}
                className="wn-slot"
                disabled={disabled}
                onClick={() => onPick(slot)}
              >
                <span className="wn-slot-name">{SLOT_LABEL[slot] ?? `スロット ${slot}`}</span>
                {meta ? (
                  <>
                    <span className="wn-slot-where">{meta.scene}</span>
                    <span className="wn-slot-preview">{meta.preview.slice(0, 24)}</span>
                    <span className="wn-slot-time">
                      {new Date(meta.savedAt).toLocaleString('ja-JP')}
                    </span>
                  </>
                ) : (
                  <span className="wn-slot-empty">空き</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

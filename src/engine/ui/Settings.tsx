import type { Runtime } from '../core/runtime.ts'
import type { Settings as SettingsData } from '../core/settings.ts'

type Props = { runtime: Runtime; onClose: () => void }

const SPEEDS: { value: SettingsData['textSpeed']; label: string }[] = [
  { value: 'slow', label: '遅い' },
  { value: 'normal', label: '普通' },
  { value: 'fast', label: '速い' },
]

const VOLUMES: { key: keyof SettingsData['volume']; label: string }[] = [
  { key: 'master', label: '全体' },
  { key: 'bgm', label: 'BGM' },
  { key: 'se', label: '効果音' },
]

/**
 * 設定はコアが持ち、`setSettings` が保存と再描画まで行う。
 * ここは表示と入力だけを担当し、値を自前で持たない。
 */
export function Settings({ runtime, onClose }: Props) {
  const s = runtime.getSettings()
  const update = (patch: Partial<SettingsData>) => runtime.setSettings({ ...s, ...patch })
  const setVolume = (key: keyof SettingsData['volume'], value: number) =>
    runtime.setSettings({ ...s, volume: { ...s.volume, [key]: value } })

  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>設定</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>

        <div className="wn-setting-row">
          <span>文字の表示</span>
          <div className="wn-choices">
            <button
              className={`wn-choice${s.textMode === 'sequential' ? ' is-on' : ''}`}
              onClick={() => update({ textMode: 'sequential' })}
            >逐次表示</button>
            <button
              className={`wn-choice${s.textMode === 'instant' ? ' is-on' : ''}`}
              onClick={() => update({ textMode: 'instant' })}
            >一括表示</button>
          </div>
        </div>

        <div className="wn-setting-row">
          <span>文字送りの速さ</span>
          <div className="wn-choices">
            {SPEEDS.map((sp) => (
              <button
                key={sp.value}
                className={`wn-choice${s.textSpeed === sp.value ? ' is-on' : ''}`}
                // 一括表示は文字が流れること自体を避ける設定なので、速さの出番がない
                disabled={s.textMode === 'instant'}
                onClick={() => update({ textSpeed: sp.value })}
              >{sp.label}</button>
            ))}
          </div>
        </div>

        {VOLUMES.map(({ key, label }) => (
          <div className="wn-setting-row" key={key}>
            <span>{label}の音量</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={s.volume[key]}
              onChange={(e) => setVolume(key, Number(e.target.value))}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

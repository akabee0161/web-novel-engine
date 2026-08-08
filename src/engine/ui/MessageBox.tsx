import { useLayoutEffect, useRef } from 'react'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'
import { computePageBreaks } from './paginate.ts'
import { displayName } from './speaker.ts'

type Props = { runtime: Runtime; state: EngineState }

export function MessageBox({ runtime, state }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const text = state.view.currentText

  /**
   * コアは本文を出したあと測定待ちで止まる。描画直後に測って境界を返す。
   *
   * 依存配列を置かず、毎レンダで「待っているか」を見る。本文をキーにすると、
   * 同じ本文が2回続いたときや、同じブロックへロードし直したときに
   * 効果が再実行されず、コアが測定待ちのまま止まる。
   */
  useLayoutEffect(() => {
    if (!runtime.isWaitingForPageBreaks()) return
    const host = measureRef.current
    const box = bodyRef.current
    if (!host || !box || !text) return
    runtime.setPageBreaks(computePageBreaks(host, text.body, box.clientHeight))
  })

  if (!text) return null

  const name = displayName(text, runtime.script.protagonist)
  const from = state.view.pageBreaks[state.view.page.current] ?? 0

  return (
    <div className="wn-messagebox">
      {name && <div className="wn-speaker">{name}</div>}
      <div className="wn-body" ref={bodyRef}>
        {text.body.slice(from, state.view.visibleChars)}
      </div>
      {/* 測定専用。本文と同じ幅・フォント・行間を持ち、画面には出ない */}
      <div className="wn-measure" ref={measureRef} aria-hidden />
      {state.view.page.total > 1 && (
        <div className="wn-page">{state.view.page.current + 1} / {state.view.page.total}</div>
      )}
    </div>
  )
}

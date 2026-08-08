import { useRef } from 'react'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'

type Props = { runtime: Runtime; state: EngineState }

/** 背景・立ち絵・回想オーバーレイを描く唯一の場所 */
export function Stage({ runtime, state }: Props) {
  const bg = state.snapshot.bg
  const fadeMs = state.view.fadeMs

  // 直前の背景を覚えておき、下に敷いたままクロスフェードする。
  // レンダー中の ref 書き換えだが、bg が変わったときだけの冪等な操作なので二重レンダーでも壊れない。
  const shown = useRef<string | null>(bg)
  const under = useRef<string | null>(null)
  if (shown.current !== bg) {
    under.current = shown.current
    shown.current = bg
  }

  const url = (name: string | null) => {
    const href = name ? runtime.resolveAsset(`bg/${name}`) : null
    return href ? `url("${href}")` : undefined
  }

  return (
    <div className="wn-scene">
      {under.current && (
        <div className="wn-bg-layer" style={{ backgroundImage: url(under.current) }} />
      )}
      {bg && (
        // key={bg} で背景が変わるたびに要素が作り直され、CSS animation が必ず最初から走る。
        // 完了の判定はコアの perform() が持っているため transitionend は待たない
        <div
          key={bg}
          className="wn-bg-layer wn-bg-in"
          data-bg={bg}
          style={{ backgroundImage: url(bg), animationDuration: `${fadeMs}ms` }}
        />
      )}

      {state.snapshot.sprites.map((sprite) => {
        const href = runtime.resolveAsset(`chara/${sprite.id}_${sprite.expr}`)
        if (!href) {
          // 表情を省略した @show はビルド時に検査できないため、ここで初めて欠落が分かる
          console.warn(`立ち絵が見つからない: chara/${sprite.id}_${sprite.expr}`)
          return null
        }
        return (
          <img
            key={sprite.id}
            className={`wn-sprite wn-sprite-${sprite.pos}`}
            data-sprite={sprite.id}
            data-expr={sprite.expr}
            src={href}
            alt=""
          />
        )
      })}
    </div>
  )
}

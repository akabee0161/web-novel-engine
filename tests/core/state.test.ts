import { describe, expect, it } from 'vitest'
import { initialState } from '../../src/engine/core/state.ts'

describe('EngineState', () => {
  it('初期状態は何も表示していない waiting 前の状態', () => {
    const s = initialState('部室・放課後')
    expect(s.snapshot).toEqual({
      bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {},
    })
    expect(s.progress).toEqual({ scene: '部室・放課後', index: 0, pc: 0 })
    expect(s.view.phase).toBe('performing')
    expect(s.view.currentText).toBeNull()
  })

  it('スナップショットは structuredClone で丸ごと複製できる', () => {
    const s = initialState('A')
    s.snapshot.sprites = [{ id: 'mika', expr: 'normal', pos: 'center' }]
    const copy = structuredClone(s.snapshot)
    copy.sprites[0].expr = 'smile'
    expect(s.snapshot.sprites[0].expr).toBe('normal')
  })
})

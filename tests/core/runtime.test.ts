import { describe, expect, it, vi } from 'vitest'
import type { CompiledScript } from '../../src/engine/core/script.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'

/** 本文だけの台本を組み立てる */
function script(scenes: { id: string; bodies: string[] }[]): CompiledScript {
  return {
    title: 'テスト',
    protagonist: null,
    assets: {},
    scenes: scenes.map((s) => ({
      id: s.id,
      steps: s.bodies.map((body, i) => ({
        t: 'text' as const, i, h: `h${i}`, speaker: null, body,
      })),
    })),
  }
}

function make(s: CompiledScript) {
  return new Runtime({ script: s, novelId: 'test', baseUrl: 'https://example.test/novel/' })
}

describe('進行', () => {
  it('start すると最初の本文を表示してクリック待ちになる', async () => {
    const r = make(script([{ id: 'A', bodies: ['一行目', '二行目'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.currentText).toEqual({ speaker: null, body: '一行目' })
    expect(r.getState().progress).toMatchObject({ scene: 'A', index: 0 })
  })

  it('advance で次の本文に進む', async () => {
    const r = make(script([{ id: 'A', bodies: ['一行目', '二行目'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('二行目'))
    expect(r.getState().progress.index).toBe(1)
  })

  it('シーンをまたぐと連番がリセットされる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a'] }, { id: 'B', bodies: ['b'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().progress.index).toBe(0)
  })

  it('終端に到達すると ended になる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('ended'))
  })

  it('waiting でない間の advance は無視される', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    r.advance() // 2回目はクリック待ちが解けているので効かない
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('b'))
  })
})

describe('購読', () => {
  it('状態が変わるたびに通知され、state の参照が変わる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    const seen: unknown[] = []
    r.subscribe(() => seen.push(r.getState()))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).not.toBe(r.getState())
  })

  it('unsubscribe すると通知が止まる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    let n = 0
    const off = r.subscribe(() => n++)
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    off()
    const before = n
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('b'))
    expect(n).toBe(before)
  })
})

describe('素材パスの解決', () => {
  it('assets の実パスを baseUrl 基準の絶対 URL にする', () => {
    const s = script([{ id: 'A', bodies: ['a'] }])
    s.assets = { 'bg/rain': 'bg/rain.svg' }
    expect(make(s).resolveAsset('bg/rain')).toBe('https://example.test/novel/bg/rain.svg')
  })

  it('無い素材は null', () => {
    expect(make(script([{ id: 'A', bodies: ['a'] }])).resolveAsset('bg/none')).toBeNull()
  })
})

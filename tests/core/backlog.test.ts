import { describe, expect, it, vi } from 'vitest'
import { BACKLOG_LIMIT, Backlog } from '../../src/engine/core/backlog.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

describe('リングバッファ', () => {
  it('上限は 200', () => {
    expect(BACKLOG_LIMIT).toBe(200)
  })

  it('上限を超えると古いものから捨てる', () => {
    const b = new Backlog()
    for (let i = 0; i < BACKLOG_LIMIT + 5; i++) b.push({ speaker: null, body: `${i}` })
    expect(b.entries()).toHaveLength(BACKLOG_LIMIT)
    expect(b.entries()[0].body).toBe('5')
    expect(b.entries().at(-1)!.body).toBe(`${BACKLOG_LIMIT + 4}`)
  })

  it('entries は毎回新しい参照を返す', () => {
    const b = new Backlog()
    const before = b.entries()
    b.push({ speaker: null, body: 'x' })
    expect(b.entries()).not.toBe(before)
  })
})

describe('積むタイミング', () => {
  const script: CompiledScript = {
    title: 't', protagonist: null, assets: {},
    scenes: [
      { id: 'A', steps: [{ t: 'text', i: 0, h: 'a', speaker: 'ミカ', body: '一' }] },
      { id: 'B', steps: [{ t: 'text', i: 0, h: 'b', speaker: null, body: '二' }] },
    ],
  }

  const make = () => {
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/' })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    return r
  }

  it('本文を表示した瞬間に積まれ、シーン境界でクリアされない', async () => {
    const r = make()
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.backlog).toEqual([{ speaker: 'ミカ', body: '一' }])
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().view.backlog).toEqual([
      { speaker: 'ミカ', body: '一' },
      { speaker: null, body: '二' },
    ])
  })

  // 申し送り（2026-08-08 の決定 4）。emit() は3層を浅くコピーするだけなので、
  // 配列を mutate すると参照が変わらず購読側から見て変化しない
  it('本文を1つ表示すると view.backlog の参照が変わる', async () => {
    const r = make()
    const before = r.getState().view.backlog
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.backlog).not.toBe(before)
  })

  it('クリック待ちのときだけ UI を開ける', async () => {
    const r = make()
    expect(r.canOpenUi()).toBe(false)
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.canOpenUi()).toBe(true)
  })
})

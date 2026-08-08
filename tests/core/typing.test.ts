import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, charDelayMs } from '../../src/engine/core/settings.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

const script: CompiledScript = {
  title: 't', protagonist: null, assets: {},
  scenes: [{ id: 'A', steps: [
    { t: 'text', i: 0, h: 'h0', speaker: null, body: 'あいうえお' },
    { t: 'text', i: 1, h: 'h1', speaker: null, body: 'かきくけこ' },
  ] }],
}

const make = (settings = DEFAULT_SETTINGS) => {
  const r = new Runtime({ script, novelId: 't', baseUrl: 'https://x.test/' })
  r.setSettings(settings)
  return r
}

describe('文字送りの速度', () => {
  it('基準は 40ms/文字', () => {
    expect(charDelayMs(DEFAULT_SETTINGS, 'normal')).toBe(40)
  })

  it('読者設定の速度が倍率として効く', () => {
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'slow' }, 'normal')).toBe(60)
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'fast' }, 'normal')).toBe(20)
  })

  it('@speed slow は読者設定に対する相対倍率として効く', () => {
    expect(charDelayMs(DEFAULT_SETTINGS, 'slow')).toBe(80)
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'fast' }, 'slow')).toBe(40)
  })

  it('一括表示のときは @speed を完全に無視して 0 になる', () => {
    const s = { ...DEFAULT_SETTINGS, textMode: 'instant' as const }
    expect(charDelayMs(s, 'slow')).toBe(0)
    expect(charDelayMs(s, 'normal')).toBe(0)
  })
})

describe('文字送りの進行', () => {
  it('逐次表示では visibleChars が 0 から増えていく', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textSpeed: 'fast' })
    // 「文字送りが始まった瞬間」はポーリングでは捕まらない。全部の emit を拾う
    const seen: number[] = []
    const unsubscribe = r.subscribe(() => seen.push(r.getState().view.visibleChars))

    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
    unsubscribe()

    expect(seen[0]).toBe(0)
    expect(seen).toEqual(expect.arrayContaining([0, 1, 2, 3, 4, 5]))
    expect(r.getState().view.visibleChars).toBe(5)
  })

  it('一括表示では最初から全文が見えている', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.visibleChars).toBe(5)
  })

  it('文字送り中のクリックは全文表示になり、次に進まない', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textSpeed: 'slow' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('typing'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.visibleChars).toBe(5)
    expect(r.getState().view.currentText?.body).toBe('あいうえお') // まだ1本文目
  })
})

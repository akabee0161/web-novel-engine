import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

/** steps をそのまま持つ1シーンの台本を作る。末尾に本文を1つ足して止める */
export function scriptOf(steps: Step[]): CompiledScript {
  return {
    title: 't', protagonist: null, assets: {},
    scenes: [{ id: 'A', steps: [...steps, { t: 'text', i: 0, h: 'h', speaker: null, body: '.' }] }],
  }
}

export function runtimeOf(steps: Step[]) {
  const r = new Runtime({ script: scriptOf(steps), novelId: 't', baseUrl: 'https://x.test/' })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  return r
}

/** 最初のクリック待ちまで進める */
export async function runToWait(r: Runtime): Promise<void> {
  void r.start()
  await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 4000 })
}

describe('@bg', () => {
  it('snapshot.bg を更新する', async () => {
    const r = runtimeOf([{ t: 'bg', name: 'clubroom_day', fade: 0 }])
    await runToWait(r)
    expect(r.getState().snapshot.bg).toBe('clubroom_day')
  })

  it('fade の時間だけ performing で止まり、fadeMs が view に出る', async () => {
    const r = runtimeOf([{ t: 'bg', name: 'clubroom_day', fade: 300 }])
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('performing'))
    expect(r.getState().view.fadeMs).toBe(300)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
  })

  it('背景はシーンをまたいで持ち越される', async () => {
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/',
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [
          { id: 'A', steps: [{ t: 'bg', name: 'x', fade: 0 }, { t: 'text', i: 0, h: 'a', speaker: null, body: 'a' }] },
          { id: 'B', steps: [{ t: 'text', i: 0, h: 'b', speaker: null, body: 'b' }] },
        ],
      },
    })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    await runToWait(r)
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().snapshot.bg).toBe('x')   // シーンは状態をリセットしない
  })
})

describe('@show / @hide', () => {
  it('初出は既定値（normal / center）で表示される', async () => {
    const r = runtimeOf([{ t: 'show', id: 'mika', expr: null, pos: null }])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'normal', pos: 'center' }])
  })

  it('表情だけの変更は位置を維持する', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: 'normal', pos: 'left' },
      { t: 'show', id: 'mika', expr: 'smile', pos: null },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'left' }])
  })

  it('位置だけの変更は表情を維持する', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: 'smile', pos: 'center' },
      { t: 'show', id: 'mika', expr: null, pos: 'right' },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'right' }])
  })

  it('@hide は1人だけ消す', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: null, pos: 'left' },
      { t: 'show', id: 'tooru', expr: null, pos: 'right' },
      { t: 'hide', id: 'mika' },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites.map((s) => s.id)).toEqual(['tooru'])
  })

  it('@hide * は全員消す', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: null, pos: 'left' },
      { t: 'show', id: 'tooru', expr: null, pos: 'right' },
      { t: 'hide', id: null },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([])
  })

  it('sprites 配列は毎回新しい参照になる（購読側が変化を検出できる）', async () => {
    const r = runtimeOf([{ t: 'show', id: 'mika', expr: null, pos: null }])
    const before = r.getState().snapshot.sprites
    await runToWait(r)
    expect(r.getState().snapshot.sprites).not.toBe(before)
  })

  it('立ち絵はシーンをまたいで持ち越される', async () => {
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/',
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [
          {
            id: 'A',
            steps: [
              { t: 'show', id: 'mika', expr: 'smile', pos: 'left' },
              { t: 'text', i: 0, h: 'a', speaker: null, body: 'a' },
            ],
          },
          { id: 'B', steps: [{ t: 'text', i: 0, h: 'b', speaker: null, body: 'b' }] },
        ],
      },
    })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    await runToWait(r)
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'left' }])
  })
})

describe('@wait / @speed / @flashback', () => {
  it('@wait は performing で指定時間だけ止まる', async () => {
    const r = runtimeOf([{ t: 'wait', ms: 200 }])
    const started = Date.now()
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('performing'))
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(180)
  })

  it('@speed は snapshot に入り、シーンをまたいで持続する', async () => {
    const r = runtimeOf([{ t: 'speed', value: 'slow' }])
    await runToWait(r)
    expect(r.getState().snapshot.speed).toBe('slow')
  })

  it('@flashback on / off が snapshot に入る', async () => {
    const on = runtimeOf([{ t: 'flashback', on: true }])
    await runToWait(on)
    expect(on.getState().snapshot.flashback).toBe(true)

    const off = runtimeOf([{ t: 'flashback', on: true }, { t: 'flashback', on: false }])
    await runToWait(off)
    expect(off.getState().snapshot.flashback).toBe(false)
  })

  it('@speed slow の区間は文字送りが遅くなる', async () => {
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/',
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [{ id: 'A', steps: [
          { t: 'speed', value: 'slow' },
          { t: 'text', i: 0, h: 'h', speaker: null, body: 'あいう' },
        ] }],
      },
    })
    r.setSettings({ textMode: 'sequential', textSpeed: 'fast', volume: { master: 1, bgm: 1, se: 1 } })
    const started = Date.now()
    await runToWait(r)
    // fast(0.5) × slow(2.0) × 40ms = 40ms/文字 × 3文字
    expect(Date.now() - started).toBeGreaterThanOrEqual(100)
  })
})

describe('演出中のクリック', () => {
  it('@wait 5000 の最中に advance() すると即座に次へ進む', async () => {
    const r = runtimeOf([{ t: 'wait', ms: 5000 }])
    void r.start()
    // 初期状態の phase も performing なので、待ちに入ったことは fadeMs で見る
    await vi.waitFor(() => expect(r.getState().view.fadeMs).toBe(5000))
    expect(r.getState().view.phase).toBe('performing')

    const started = Date.now()
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 1000 })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('打ち切るのは現在の待ちだけで、次の本文ブロックには進まない', async () => {
    const r = runtimeOf([{ t: 'wait', ms: 5000 }])
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.fadeMs).toBe(5000))

    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 1000 })
    // 待ちの次にある本文が表示されており、飛ばされていない
    expect(r.getState().view.currentText?.body).toBe('.')
  })

  it('連続した待ちは、クリックのたびに1つずつ打ち切られる', async () => {
    // 尺を変えておくと、2つ目の待ちに入ったことを fadeMs で見分けられる
    const r = runtimeOf([{ t: 'wait', ms: 5000 }, { t: 'wait', ms: 4000 }])
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.fadeMs).toBe(5000))

    // 1回目のクリックでは1つ目の待ちが終わるだけで、2つ目の待ちに入る
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.fadeMs).toBe(4000))
    expect(r.getState().view.phase).toBe('performing')
    expect(r.getState().view.currentText).toBeNull()

    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 1000 })
  })
})

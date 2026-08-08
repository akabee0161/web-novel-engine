import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import { memoryStorage } from '../../src/engine/core/storage.ts'
import { LoadError } from '../../src/engine/core/save.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

const text = (i: number, body: string): Step => ({ t: 'text', i, h: `h${i}`, speaker: null, body })

/** 演出と本文が混ざった2シーンの台本 */
function fullScript(): CompiledScript {
  return {
    title: 't', protagonist: null, assets: {},
    scenes: [
      { id: 'A', steps: [
        { t: 'bg', name: 'room', fade: 0 },
        { t: 'bgm', name: 'daily' },
        text(0, '一'),
        { t: 'show', id: 'mika', expr: 'smile', pos: 'left' },
        { t: 'se', name: 'door' },
        text(1, '二'),
        { t: 'speed', value: 'slow' },
        text(2, '三'),
      ] },
      { id: 'B', steps: [{ t: 'bg', name: 'corridor', fade: 0 }, text(0, '四')] },
    ],
  }
}

function make(script = fullScript(), audio?: unknown) {
  const r = new Runtime({
    script, novelId: 'n', baseUrl: 'https://x.test/',
    storage: memoryStorage(),
    ...(audio ? { audio: audio as never } : {}),
  })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  return r
}

const wait = (r: Runtime) =>
  vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 4000 })

/**
 * n 回 advance して、次の本文のクリック待ちまで進める。
 * `advance()` は待ちを解くだけで phase をその場で変えないため、
 * 「waiting になるまで」で待つと1度も進まずに通ってしまう。本文が変わるまで待つ。
 */
async function step(r: Runtime, n: number) {
  for (let k = 0; k < n; k++) {
    const before = r.getState().view.currentText?.body
    r.advance()
    await vi.waitFor(() => {
      expect(r.getState().view.phase).toBe('waiting')
      expect(r.getState().view.currentText?.body).not.toBe(before)
    }, { timeout: 4000 })
  }
}

describe('セーブの表現', () => {
  it('シーンID・シーン入口スナップショット・本文ブロック連番の3つ', async () => {
    const r = make()
    void r.start()
    await wait(r)
    await step(r, 2)   // i:2 を表示中

    const save = r.makeSave()
    expect(save.scene).toBe('A')
    expect(save.index).toBe(2)
    // スナップショットは「シーンに入った瞬間」の値。@bg も @bgm もまだ実行されていない
    expect(save.snapshot).toEqual({
      bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {},
    })
  })

  it('index はセーブした瞬間に表示していたブロック（次ではない）', async () => {
    const r = make()
    void r.start()
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('一')
    expect(r.makeSave().index).toBe(0)
  })

  it('シーンをまたぐと入口スナップショットが更新される', async () => {
    const r = make()
    void r.start()
    await wait(r)
    await step(r, 3)   // シーン B の i:0
    const save = r.makeSave()
    expect(save.scene).toBe('B')
    expect(save.snapshot.bg).toBe('room')        // A で設定した背景が持ち越されている
    expect(save.snapshot.speed).toBe('slow')     // @speed も持ち越されている
    expect(save.snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'left' }])
  })
})

describe('ロードとリプレイ', () => {
  it('セーブ時の画面が再現される', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    const b = make()
    void b.load(save)
    await wait(b)

    expect(b.getState().view.currentText?.body).toBe('三')   // i:2 を表示中
    expect(b.getState().progress).toMatchObject({ scene: 'A', index: 2 })
    expect(b.getState().snapshot).toEqual(a.getState().snapshot)
  })

  it('同じセーブから2回復元すると状態が完全に一致する（不変条件2）', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    const first = make()
    void first.load(structuredClone(save))
    await wait(first)

    const second = make()
    void second.load(structuredClone(save))
    await wait(second)

    expect(first.getState().snapshot).toEqual(second.getState().snapshot)
    expect(first.getState().progress).toEqual(second.getState().progress)
    expect(first.getState().view.currentText).toEqual(second.getState().view.currentText)
    expect(first.getState().view.backlog).toEqual(second.getState().view.backlog)
  })

  it('save → load でスナップショットがラウンドトリップする', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 3)
    const save = a.makeSave()

    const b = make()
    void b.load(JSON.parse(JSON.stringify(save)))
    await wait(b)
    expect(b.makeSave()).toEqual(save)
  })

  it('リプレイで通過した本文がバックログに積まれる', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)

    const b = make()
    void b.load(a.makeSave())
    await wait(b)
    expect(b.getState().view.backlog.map((e) => e.body)).toEqual(['一', '二', '三'])
  })

  it('リプレイ中は SE を鳴らさず、終了時に BGM を1度だけ同期する', async () => {
    const calls: string[] = []
    const audio = {
      unlock() {}, setVolumes() {}, resumeIfSuspended() {},
      syncBgm(n: string | null) { calls.push(`bgm:${n}`) },
      playSe(n: string) { calls.push(`se:${n}`) },
    }
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)

    const b = make(fullScript(), audio)
    void b.load(a.makeSave())
    await wait(b)

    expect(calls.filter((c) => c.startsWith('se:'))).toEqual([])
    expect(calls).toEqual(['bgm:daily'])
  })

  it('リプレイ中は演出の待ち時間を消費しない', async () => {
    const slow = fullScript()
    // 合計 10 秒ぶんの演出を、リプレイの対象区間に置く
    slow.scenes[0].steps.splice(3, 0, { t: 'wait', ms: 5000 }, { t: 'bg', name: 'x', fade: 5000 })

    const b = make(slow)
    const started = Date.now()
    void b.load({ scene: 'A', index: 2, snapshot: b.getState().snapshot })
    await wait(b)
    expect(Date.now() - started).toBeLessThan(1000)
  })
})

describe('解決できない場合', () => {
  it('index がブロック数を超えたら最後のブロックにクランプする', async () => {
    const r = make()
    void r.load({ scene: 'A', index: 99, snapshot: r.getState().snapshot })
    await wait(r)
    expect(r.getState().progress.index).toBe(2)
    expect(r.getState().view.currentText?.body).toBe('三')
  })

  it('シーンが存在しなければロード失敗として明示する', async () => {
    const r = make()
    await expect(r.load({ scene: '無いシーン', index: 0, snapshot: r.getState().snapshot }))
      .rejects.toBeInstanceOf(LoadError)
  })
})

describe('連番の耐性', () => {
  it('演出行を挿入しても既存セーブの index が指す本文は変わらない', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    // シーン A の先頭に演出を3行足した台本
    const patched = fullScript()
    patched.scenes[0].steps.unshift(
      { t: 'wait', ms: 0 },
      { t: 'flashback', on: false },
      { t: 'se', name: 'x' },
    )

    const b = make(patched)
    void b.load(save)
    await wait(b)
    expect(b.getState().view.currentText?.body).toBe('三')
  })
})

describe('再生中のロード', () => {
  it('前の再生ループが状態を動かさない', async () => {
    const r = make()
    void r.start()
    await wait(r)
    await step(r, 1)   // シーン A の i:1 を表示中

    // 進行中の再生を残したまま、シーン B の先頭へロードする
    void r.load({ scene: 'B', index: 0, snapshot: r.getState().snapshot })
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('四')

    // 打ち切られた側が生きていれば、ここで A の続きに引き戻される
    await new Promise((done) => setTimeout(done, 50))
    expect(r.getState().progress.scene).toBe('B')
    expect(r.getState().view.currentText?.body).toBe('四')
  })
})

describe('スロット', () => {
  it('保存・一覧・読み込みができる', async () => {
    const storage = memoryStorage()
    const opts = { script: fullScript(), novelId: 'n', baseUrl: 'https://x.test/', storage }
    const a = new Runtime(opts)
    a.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void a.start()
    await wait(a)
    await step(a, 1)
    a.saveTo('1')

    const list = a.listSaves()
    expect(list.map((m) => m.slot)).toContain('1')
    expect(list.find((m) => m.slot === '1')).toMatchObject({ scene: 'A', index: 1, preview: '二' })

    const b = new Runtime(opts)
    b.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void b.loadFrom('1')
    await wait(b)
    expect(b.getState().view.currentText?.body).toBe('二')
  })

  it('セーブ可能点でなければ保存しない', () => {
    const r = make()
    expect(r.canSave()).toBe(false)
    expect(() => r.saveTo('1')).toThrow('セーブできるのはクリック待ちの瞬間だけ')
  })

  it('壊れたセーブデータは一覧に出ず、読み込むと失敗する', async () => {
    const storage = memoryStorage()
    storage.set('wn:n:save:1', '{壊れている')
    const r = new Runtime({ script: fullScript(), novelId: 'n', baseUrl: 'https://x.test/', storage })
    expect(r.listSaves()).toEqual([])
    await expect(r.loadFrom('1')).rejects.toBeInstanceOf(LoadError)
  })
})

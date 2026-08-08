import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import { SystemStore, memoryStorage, systemKey } from '../../src/engine/core/storage.ts'
import { ReadSet } from '../../src/engine/core/read.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

const script: CompiledScript = {
  title: 't', protagonist: null, assets: {},
  scenes: [{ id: 'A', steps: [
    { t: 'text', i: 0, h: 'aaa', speaker: null, body: '一' },
    { t: 'text', i: 1, h: 'bbb', speaker: null, body: '二' },
  ] }],
}

describe('ReadSet', () => {
  it('追加した分だけ dirty になり、takeDirty で1度だけ取れる', () => {
    const r = new ReadSet(['x'])
    expect(r.takeDirty()).toBeNull()
    r.add('y')
    expect(r.takeDirty()).toEqual(['x', 'y'])
    expect(r.takeDirty()).toBeNull()
  })

  it('同じハッシュを2回足しても dirty にならない', () => {
    const r = new ReadSet(['x'])
    r.add('x')
    expect(r.takeDirty()).toBeNull()
  })
})

describe('既読の記録', () => {
  it('本文を表示した瞬間に記録される（セーブ操作と無関係）', async () => {
    const storage = memoryStorage()
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.isRead('aaa')).toBe(true)
    expect(r.isRead('bbb')).toBe(false)
  })

  it('flushSystem でストレージに書き出される', async () => {
    const storage = memoryStorage()
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.flushSystem()
    expect(JSON.parse(storage.get(systemKey('n'))!).read).toEqual(['aaa'])
  })

  it('既読は起動時に復元される', async () => {
    const storage = memoryStorage()
    new SystemStore(storage, 'n').save({ read: ['aaa'], settings: DEFAULT_SETTINGS })
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    expect(r.isRead('aaa')).toBe(true)
  })

  it('壊れたシステムデータは既定値にフォールバックする', () => {
    const storage = memoryStorage()
    storage.set(systemKey('n'), '{壊れている')
    expect(new SystemStore(storage, 'n').load()).toEqual({ read: [], settings: DEFAULT_SETTINGS })
  })
})

describe('設定の永続化', () => {
  it('setSettings は即座に書き出し、次回起動時に復元される', () => {
    const storage = memoryStorage()
    const a = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    a.setSettings({ ...DEFAULT_SETTINGS, textSpeed: 'fast' })

    const b = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    expect(b.getSettings().textSpeed).toBe('fast')
  })

  it('設定の書き出しで既読が消えない', async () => {
    const storage = memoryStorage()
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant', textSpeed: 'slow' })
    expect(JSON.parse(storage.get(systemKey('n'))!).read).toEqual(['aaa'])
  })
})

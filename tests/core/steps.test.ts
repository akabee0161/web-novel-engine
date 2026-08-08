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

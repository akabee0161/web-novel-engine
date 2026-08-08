import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { AudioPort } from '../../src/engine/core/audio.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

function spyAudio() {
  return {
    calls: [] as string[],
    unlock() { this.calls.push('unlock') },
    syncBgm(name: string | null, fadeMs = 0) { this.calls.push(`bgm:${name}:${fadeMs}`) },
    playSe(name: string) { this.calls.push(`se:${name}`) },
    setVolumes() {},
    resumeIfSuspended() {},
  } satisfies AudioPort & { calls: string[] }
}

function run(steps: Step[], audio: AudioPort) {
  const script: CompiledScript = {
    title: 't', protagonist: null, assets: {},
    scenes: [{ id: 'A', steps: [...steps, { t: 'text', i: 0, h: 'h', speaker: null, body: '.' }] }],
  }
  const r = new Runtime({ script, novelId: 't', baseUrl: 'https://x.test/', audio })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  void r.start()
  return r
}

describe('@bgm の意味論', () => {
  it('同じ名前の @bgm が再度来ても鳴らし直さない', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgm', name: 'daily' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0'])
  })

  it('別の名前が来たら差し替える', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgm', name: 'tension' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0', 'bgm:tension:0'])
  })

  it('@bgm stop は fade 付きで null にする', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgmStop', fade: 1200 }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0', 'bgm:null:1200'])
    expect(r.getState().snapshot.bgm).toBeNull()
  })

  it('@se は同名でも毎回鳴る', async () => {
    const a = spyAudio()
    const r = run([{ t: 'se', name: 'paper' }, { t: 'se', name: 'paper' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['se:paper', 'se:paper'])
  })

  it('@se は状態を持たない（snapshot に現れない）', async () => {
    const a = spyAudio()
    const r = run([{ t: 'se', name: 'paper' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(Object.values(r.getState().snapshot)).not.toContain('paper')
  })

  it('BGM はシーンをまたいで持ち越され、鳴らし直されない', async () => {
    const a = spyAudio()
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/', audio: a,
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [
          {
            id: 'A',
            steps: [
              { t: 'bgm', name: 'daily' },
              { t: 'text', i: 0, h: 'a', speaker: null, body: 'a' },
            ],
          },
          {
            id: 'B',
            steps: [
              { t: 'bgm', name: 'daily' },
              { t: 'text', i: 0, h: 'b', speaker: null, body: 'b' },
            ],
          },
        ],
      },
    })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(a.calls).toEqual(['bgm:daily:0'])
    expect(r.getState().snapshot.bgm).toBe('daily')
  })
})

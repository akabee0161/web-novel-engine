import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compile } from '../../tools/wn-compile/index.ts'

/** bg/rain.svg と chara/mika_normal.svg を持つ public/ を作る */
function fixturePublic(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wn-'))
  mkdirSync(join(dir, 'bg'), { recursive: true })
  mkdirSync(join(dir, 'chara'), { recursive: true })
  writeFileSync(join(dir, 'bg', 'rain.svg'), '<svg/>')
  writeFileSync(join(dir, 'chara', 'mika_normal.svg'), '<svg/>')
  return dir
}

describe('既読ハッシュ', () => {
  const pub = fixturePublic()

  it('12桁の16進で、シーン名・話者・本文から決まる', () => {
    const r = compile('= scene A\n>ミカ\n「うん」', 'test.wn', pub)
    const step = r.scenes[0].steps[0]
    expect(step.t).toBe('text')
    if (step.t !== 'text') return
    expect(step.h).toMatch(/^[0-9a-f]{12}$/)
  })

  it('シーンが違えば同じ本文でもハッシュが変わる', () => {
    const a = compile('= scene A\n>ミカ\n「うん」', 'test.wn', pub)
    const b = compile('= scene B\n>ミカ\n「うん」', 'test.wn', pub)
    const ha = a.scenes[0].steps[0]
    const hb = b.scenes[0].steps[0]
    if (ha.t !== 'text' || hb.t !== 'text') throw new Error('text ではない')
    expect(ha.h).not.toBe(hb.h)
  })

  it('本文を変えたブロックだけハッシュが変わる', () => {
    const a = compile('= scene A\n一行目\n二行目', 'test.wn', pub)
    const b = compile('= scene A\n一行目\n二行目（改稿）', 'test.wn', pub)
    const ax = a.scenes[0].steps
    const bx = b.scenes[0].steps
    if (ax[0].t !== 'text' || bx[0].t !== 'text') throw new Error('text ではない')
    if (ax[1].t !== 'text' || bx[1].t !== 'text') throw new Error('text ではない')
    expect(ax[0].h).toBe(bx[0].h)
    expect(ax[1].h).not.toBe(bx[1].h)
  })

  it('本文ブロックを挿入しても既存ブロックのハッシュは変わらない', () => {
    const a = compile('= scene A\n一行目\n二行目', 'test.wn', pub)
    const b = compile('= scene A\n一行目\n挿入した行\n二行目', 'test.wn', pub)
    const hashes = (r: ReturnType<typeof compile>) =>
      r.scenes[0].steps.flatMap((s) => (s.t === 'text' ? [s.h] : []))
    expect(hashes(a).every((h) => hashes(b).includes(h))).toBe(true)
  })

  it('話者を伏せた > と > なしは同じハッシュになる', () => {
    const a = compile('= scene A\n>\n「……」', 'test.wn', pub)
    const b = compile('= scene A\n「……」', 'test.wn', pub)
    const ha = a.scenes[0].steps[0]
    const hb = b.scenes[0].steps[0]
    if (ha.t !== 'text' || hb.t !== 'text') throw new Error('text ではない')
    expect(ha.h).toBe(hb.h)
  })
})

describe('素材の解決', () => {
  const pub = fixturePublic()

  it('assets に論理名 → 実パスが入る', () => {
    const r = compile('@bg rain\n本文', 'test.wn', pub)
    expect(r.assets['bg/rain']).toBe('bg/rain.svg')
    expect(r.assets['chara/mika_normal']).toBe('chara/mika_normal.svg')
  })

  it('素材の置き忘れがビルドエラーになる', () => {
    expect(() => compile('@bg missing\n本文', 'test.wn', pub))
      .toThrow('test.wn:1: 素材が見つからない: bg/missing')
  })

  it('表情を省略した @show は存在チェックしない', () => {
    expect(() => compile('@show mika pos:left\n本文', 'test.wn', pub)).not.toThrow()
  })
})

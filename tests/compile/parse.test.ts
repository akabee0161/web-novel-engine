import { describe, expect, it } from 'vitest'
import { parse } from '../../tools/wn-compile/parse.ts'

describe('第一原則', () => {
  it('記法を1つも含まないプレーンテキストが全行本文になる', () => {
    const src = [
      '放課後の部室は、いつも通り紙の匂いがした。',
      '',
      '窓際の机に部誌の束が積んである。',
    ].join('\n')

    const r = parse(src, 'test.wn')

    expect(r.scenes).toHaveLength(1)
    expect(r.scenes[0].steps).toEqual([
      { t: 'text', i: 0, speaker: null, body: '放課後の部室は、いつも通り紙の匂いがした。' },
      { t: 'text', i: 1, speaker: null, body: '窓際の机に部誌の束が積んである。' },
    ])
  })

  it('「」で始まる行も本文として通る', () => {
    const r = parse('「いちばん地味なやつ」', 'test.wn')
    expect(r.scenes[0].steps[0]).toMatchObject({ t: 'text', body: '「いちばん地味なやつ」' })
  })

  it('空行とコメントは捨てられ、連番に影響しない', () => {
    const r = parse('一行目\n\n# コメント\n二行目', 'test.wn')
    const texts = r.scenes[0].steps.filter((s) => s.t === 'text')
    expect(texts.map((s) => s.i)).toEqual([0, 1])
  })
})

describe('シーン宣言', () => {
  it('シーンごとに連番がリセットされる', () => {
    const r = parse('= scene A\n本文1\n本文2\n= scene B\n本文3', 'test.wn')
    expect(r.scenes.map((s) => s.id)).toEqual(['A', 'B'])
    expect(r.scenes[0].steps.map((s) => (s.t === 'text' ? s.i : -1))).toEqual([0, 1])
    expect(r.scenes[1].steps.map((s) => (s.t === 'text' ? s.i : -1))).toEqual([0])
  })

  it('シーン名の重複が行番号付きで落ちる', () => {
    expect(() => parse('= scene A\n本文\n= scene A\n本文', 'test.wn'))
      .toThrow('test.wn:3: シーン名が重複している: A')
  })
})

describe('話者', () => {
  it('> は直後の1ブロックにだけ効く', () => {
    const r = parse('>ミカ\n「おつかれ」\n彼女は笑った。', 'test.wn')
    const texts = r.scenes[0].steps.filter((s) => s.t === 'text')
    expect(texts[0]).toMatchObject({ speaker: 'ミカ', body: '「おつかれ」' })
    expect(texts[1]).toMatchObject({ speaker: null, body: '彼女は笑った。' })
  })

  it('引数なしの > は話者を伏せる（話者なしと同じ扱い）', () => {
    const r = parse('>\n「……」', 'test.wn')
    expect(r.scenes[0].steps[0]).toMatchObject({ speaker: null })
  })
})

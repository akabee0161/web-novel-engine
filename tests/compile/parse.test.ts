import { describe, expect, it } from 'vitest'
import { parse, type RawStep } from '../../tools/wn-compile/parse.ts'

const steps = (src: string): RawStep[] => parse(src, 'test.wn').scenes[0]?.steps ?? []

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

describe('命令のパース', () => {
  it('@bg', () => {
    expect(steps('@bg clubroom_day fade:600\nx')[0])
      .toEqual({ t: 'bg', name: 'clubroom_day', fade: 600 })
  })

  it('@bg の fade 省略時は 0', () => {
    expect(steps('@bg clubroom_day\nx')[0]).toEqual({ t: 'bg', name: 'clubroom_day', fade: 0 })
  })

  it('@bgm', () => {
    expect(steps('@bgm daily\nx')[0]).toEqual({ t: 'bgm', name: 'daily' })
  })

  it('@bgm stop は別の step になる', () => {
    expect(steps('@bgm stop fade:1200\nx')[0]).toEqual({ t: 'bgmStop', fade: 1200 })
  })

  it('@se', () => {
    expect(steps('@se door_open\nx')[0]).toEqual({ t: 'se', name: 'door_open' })
  })

  it('@show の全指定', () => {
    expect(steps('@show mika normal pos:center\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: 'normal', pos: 'center' })
  })

  it('@show の省略は null になり、実行時に現在値を維持する', () => {
    expect(steps('@show mika smile\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: 'smile', pos: null })
    expect(steps('@show mika pos:left\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: null, pos: 'left' })
  })

  it('@hide と @hide *', () => {
    expect(steps('@hide mika\nx')[0]).toEqual({ t: 'hide', id: 'mika' })
    expect(steps('@hide *\nx')[0]).toEqual({ t: 'hide', id: null })
  })

  it('@wait / @speed / @flashback', () => {
    expect(steps('@wait 300\nx')[0]).toEqual({ t: 'wait', ms: 300 })
    expect(steps('@speed slow\nx')[0]).toEqual({ t: 'speed', value: 'slow' })
    expect(steps('@flashback on\nx')[0]).toEqual({ t: 'flashback', on: true })
    expect(steps('@flashback off\nx')[0]).toEqual({ t: 'flashback', on: false })
  })

  it('@title / @protagonist はメタに抜ける', () => {
    const r = parse('@title 消えた一篇\n@protagonist ハル\n本文', 'test.wn')
    expect(r.title).toBe('消えた一篇')
    expect(r.protagonist).toBe('ハル')
    expect(r.scenes[0].steps).toHaveLength(1)
  })

  it('@title は空白を含む文字列をそのまま取る', () => {
    expect(parse('@title 消えた 一篇\nx', 'test.wn').title).toBe('消えた 一篇')
  })
})

describe('コンパイルエラー', () => {
  it('未知の命令が行番号付きで落ちる', () => {
    expect(() => parse('本文\n@bgx a', 'test.wn'))
      .toThrow('test.wn:2: 未知の命令: @bgx')
  })

  it('引数不足が落ちる', () => {
    expect(() => parse('@bg', 'test.wn')).toThrow('test.wn:1: @bg は背景名が要る')
  })

  it('引数の型違いが落ちる', () => {
    expect(() => parse('@wait すぐ', 'test.wn'))
      .toThrow('test.wn:1: @wait はミリ秒（整数）が要る: すぐ')
    expect(() => parse('@speed fast', 'test.wn'))
      .toThrow('test.wn:1: @speed は slow か normal: fast')
    expect(() => parse('@show mika pos:up', 'test.wn'))
      .toThrow('test.wn:1: pos は left / center / right のどれか: up')
  })
})

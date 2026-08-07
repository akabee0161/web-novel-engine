import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../../tools/wn-compile/parse.ts'

describe('drafts/sample-short.wn', () => {
  const src = readFileSync(new URL('../../drafts/sample-short.wn', import.meta.url), 'utf8')

  it('パースが通り、6シーンになる', () => {
    const r = parse(src, 'sample-short.wn')
    expect(r.title).toBe('消えた一篇')
    expect(r.protagonist).toBe('ハル')
    expect(r.scenes.map((s) => s.id)).toEqual([
      '部室・放課後', '部室・違和感', '廊下', '回想・昨日の部室', '屋上前', '引き',
    ])
  })

  it('演出行を何行挟んでも本文の連番は詰まっている', () => {
    const r = parse(src, 'sample-short.wn')
    for (const scene of r.scenes) {
      const ids = scene.steps.filter((s) => s.t === 'text').map((s) => s.i)
      expect(ids).toEqual(ids.map((_, k) => k))
    }
  })
})

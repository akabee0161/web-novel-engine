import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAssetsDir } from '../../tools/wn-compile/config.ts'

/** 作品ディレクトリを1つ作る。config を渡すと novel.config.json も置く */
function novelDir(config?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'wn-novel-'))
  if (config !== undefined) writeFileSync(join(dir, 'novel.config.json'), config)
  return dir
}

describe('素材ディレクトリの解決', () => {
  it('設定ファイルが無ければ <作品ディレクトリ>/public', () => {
    const dir = novelDir()
    mkdirSync(join(dir, 'public'))
    expect(resolveAssetsDir(dir)).toBe(resolve(dir, 'public'))
  })

  it('素材ディレクトリが無い作品も通る（本文だけの台本）', () => {
    const dir = novelDir()
    expect(resolveAssetsDir(dir)).toBe(resolve(dir, 'public'))
  })

  it('assetsDir は作品ディレクトリからの相対パスとして解決される', () => {
    const dir = novelDir('{"assetsDir": "../shared-assets"}')
    mkdirSync(resolve(dir, '../shared-assets'), { recursive: true })
    expect(resolveAssetsDir(dir)).toBe(resolve(dir, '../shared-assets'))
  })

  it('絶対パスはそのまま使われる', () => {
    const outside = mkdtempSync(join(tmpdir(), 'wn-assets-'))
    const dir = novelDir(JSON.stringify({ assetsDir: outside }))
    expect(resolveAssetsDir(dir)).toBe(outside)
  })

  it('明示した assetsDir が存在しなければ落ちる（設定ミス）', () => {
    const dir = novelDir('{"assetsDir": "./typo"}')
    expect(() => resolveAssetsDir(dir)).toThrow('素材ディレクトリが見つからない')
  })

  it('JSON として壊れていれば落ちる', () => {
    const dir = novelDir('{ assetsDir: }')
    expect(() => resolveAssetsDir(dir)).toThrow('JSON として読めない')
  })

  it('assetsDir が文字列でなければ落ちる', () => {
    const dir = novelDir('{"assetsDir": 1}')
    expect(() => resolveAssetsDir(dir)).toThrow('assetsDir は文字列でなければならない')
  })
})

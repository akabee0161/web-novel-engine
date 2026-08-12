import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldNovel } from '../../tools/scaffold-novel/index.ts'

/** kieta-ippen 相当の最小の雛形を作った novels/ ディレクトリ */
function fixtureNovelsDir(): string {
  const novelsDir = mkdtempSync(join(tmpdir(), 'novels-'))
  const templateDir = join(novelsDir, 'template-novel')
  mkdirSync(templateDir, { recursive: true })
  writeFileSync(
    join(templateDir, 'index.html'),
    '<!doctype html>\n<html><head><title>元のタイトル</title></head><body></body></html>\n',
  )
  writeFileSync(
    join(templateDir, 'main.ts'),
    [
      "import { boot } from '@engine'",
      "import script from './script.wn'",
      '',
      'boot({',
      "  mount: document.getElementById('app')!,",
      '  script,',
      "  novelId: 'template-novel',",
      '})',
      '',
    ].join('\n'),
  )
  return novelsDir
}

describe('scaffoldNovel', () => {
  it('index.html と main.ts を作品ID差し替えでコピーする', () => {
    const novelsDir = fixtureNovelsDir()

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    expect(dir).toBe(join(novelsDir, 'new-novel'))
    const mainTs = readFileSync(join(dir, 'main.ts'), 'utf8')
    expect(mainTs).toContain("novelId: 'new-novel'")
    expect(mainTs).not.toContain('template-novel')
    const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8')
    expect(indexHtml).toContain('<title>new-novel</title>')
  })

  it('public/{bg,bgm,chara,se} を空で作る', () => {
    const novelsDir = fixtureNovelsDir()

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    for (const sub of ['bg', 'bgm', 'chara', 'se']) {
      expect(existsSync(join(dir, 'public', sub))).toBe(true)
    }
  })

  it('script.wn はコピーしない', () => {
    const novelsDir = fixtureNovelsDir()
    writeFileSync(join(novelsDir, 'template-novel', 'script.wn'), '= scene A\nテスト')

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    expect(existsSync(join(dir, 'script.wn'))).toBe(false)
  })

  it('雛形が存在しなければエラーにする', () => {
    const novelsDir = mkdtempSync(join(tmpdir(), 'novels-'))

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'no-such', novelId: 'new-novel' }),
    ).toThrow('雛形の作品ディレクトリが見つからない')
  })

  it('作品IDが既に存在すればエラーにする', () => {
    const novelsDir = fixtureNovelsDir()
    mkdirSync(join(novelsDir, 'new-novel'))

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' }),
    ).toThrow('作品ディレクトリが既に存在する')
  })

  it('新規作品IDにパス区切りが含まれていればエラーにする', () => {
    const novelsDir = fixtureNovelsDir()

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: '../outside' }),
    ).toThrow('新規作品IDが不正')
    expect(existsSync(join(novelsDir, '..', 'outside'))).toBe(false)
  })

  it('雛形IDにパス区切りが含まれていればエラーにする', () => {
    const novelsDir = fixtureNovelsDir()

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: '../outside', novelId: 'new-novel' }),
    ).toThrow('雛形の作品IDが不正')
  })

  it('雛形の main.ts に novelId が無ければ、対象ディレクトリを作らずにエラーにする', () => {
    const novelsDir = fixtureNovelsDir()
    writeFileSync(join(novelsDir, 'template-novel', 'main.ts'), "console.log('novelId 指定なし')\n")

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' }),
    ).toThrow('雛形の main.ts に novelId の指定が見つからない')
    expect(existsSync(join(novelsDir, 'new-novel'))).toBe(false)
  })
})

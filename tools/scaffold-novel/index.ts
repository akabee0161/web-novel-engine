import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type ScaffoldNovelOptions = {
  /** novels/ ディレクトリの絶対パス */
  novelsDir: string
  /** 雛形にする既存の作品ID */
  templateId: string
  /** 新規作品ID */
  novelId: string
}

const ASSET_SUBDIRS = ['bg', 'bgm', 'chara', 'se']

/**
 * 既存作品を雛形に、新規作品ディレクトリを作る。
 * script.wn は含まない（novel-to-wn スキルが別途生成する）。
 */
export function scaffoldNovel(opts: ScaffoldNovelOptions): { dir: string } {
  const { novelsDir, templateId, novelId } = opts
  const templateDir = join(novelsDir, templateId)
  const targetDir = join(novelsDir, novelId)

  if (!existsSync(templateDir)) {
    throw new Error(`雛形の作品ディレクトリが見つからない: ${templateDir}`)
  }
  if (existsSync(targetDir)) {
    throw new Error(`作品ディレクトリが既に存在する: ${targetDir}`)
  }

  mkdirSync(targetDir, { recursive: true })
  writeFileSync(join(targetDir, 'index.html'), buildIndexHtml(novelId))
  writeFileSync(join(targetDir, 'main.ts'), buildMainTs(templateDir, novelId))

  for (const sub of ASSET_SUBDIRS) {
    const dir = join(targetDir, 'public', sub)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.gitkeep'), '')
  }

  return { dir: targetDir }
}

function buildIndexHtml(novelId: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${novelId}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`
}

function buildMainTs(templateDir: string, novelId: string): string {
  const templatePath = join(templateDir, 'main.ts')
  const template = readFileSync(templatePath, 'utf8')
  const replaced = template.replace(/novelId:\s*'[^']*'/, `novelId: '${novelId}'`)
  if (replaced === template) {
    throw new Error(`雛形の main.ts に novelId の指定が見つからない: ${templatePath}`)
  }
  return replaced
}

// CLI: node tools/scaffold-novel/index.ts <雛形の作品ID> <新規作品ID>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [templateId, novelId] = process.argv.slice(2)
  if (!templateId || !novelId) {
    console.error('使い方: node tools/scaffold-novel/index.ts <雛形にする作品ID> <新規作品ID>')
    process.exit(1)
  }
  const novelsDir = resolve(import.meta.dirname, '..', '..', 'novels')
  const { dir } = scaffoldNovel({ novelsDir, templateId, novelId })
  console.log(`作品ディレクトリを作成した: ${dir}`)
}

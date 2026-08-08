import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

/**
 * `novels/<作品ID>/novel.config.json` の形。**ファイル自体が任意。**
 * 必須にすると「作品を増やすコストはディレクトリ1つ」という構成上の前提が崩れる。
 */
export type NovelConfig = {
  /** 素材ディレクトリ。作品ディレクトリからの相対パス、または絶対パス */
  assetsDir?: string
}

const CONFIG_NAME = 'novel.config.json'
const DEFAULT_ASSETS_DIR = 'public'

/**
 * 作品の素材ディレクトリを決める。
 *
 * 既定は `<作品ディレクトリ>/public`。実素材をリポジトリの外に置きたいときだけ、
 * `novel.config.json` の `assetsDir` で差し替える。
 * 素材の秘匿はできない（静的サイトなので配信物は必ず取得できる）。
 * この設定が守るのは「リポジトリに原本を置かない」ことだけ。
 */
export function resolveAssetsDir(novelDir: string): string {
  const configPath = join(novelDir, CONFIG_NAME)
  const configured = readConfig(configPath)?.assetsDir
  const dir = configured ?? DEFAULT_ASSETS_DIR
  const abs = isAbsolute(dir) ? dir : resolve(novelDir, dir)

  // 明示した指定が存在しないのは設定ミス。既定値の不在は「素材の無い作品」なので許す
  if (configured !== undefined && !existsSync(abs)) {
    throw new Error(`素材ディレクトリが見つからない: ${abs}（${configPath} の assetsDir を確認）`)
  }
  return abs
}

function readConfig(path: string): NovelConfig | null {
  if (!existsSync(path)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`${path} が JSON として読めない: ${(e as Error).message}`, { cause: e })
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} はオブジェクトでなければならない`)
  }

  const { assetsDir } = parsed as Record<string, unknown>
  if (assetsDir !== undefined && typeof assetsDir !== 'string') {
    throw new Error(`${path} の assetsDir は文字列でなければならない`)
  }
  return { assetsDir }
}

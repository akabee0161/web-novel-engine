import { existsSync, readdirSync } from 'node:fs'
import { join, parse as parsePath } from 'node:path'

const KINDS = ['bg', 'bgm', 'se', 'chara'] as const

/**
 * public/{bg,bgm,se,chara}/ を走査して、論理名 → 実パスの表を作る。
 * 論理名は 'bg/rain_street'、実パスは 'bg/rain_street.webp'（public/ からの相対）。
 *
 * 同名で拡張子違いのファイルが両方あると後勝ちになり、台本側は拡張子を書かないため
 * どちらが選ばれるかは不定になる。素材は1つの名前につき1ファイルだけ置くこと。
 */
export function scanAssets(publicDir: string): Record<string, string> {
  const table: Record<string, string> = {}
  for (const kind of KINDS) {
    const dir = join(publicDir, kind)
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const { name } = parsePath(entry.name)
      table[`${kind}/${name}`] = `${kind}/${entry.name}`
    }
  }
  return table
}

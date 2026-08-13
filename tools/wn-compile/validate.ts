import { readFileSync } from 'node:fs'
import { parse, WnError } from './parse.ts'

export type ValidateResult = { ok: true } | { ok: false; message: string }

/**
 * script.wn の構文とシーン名の一意性だけを検査する。
 * 素材の実在は見ない（フル compile() と違う。実素材の用意はスキルのスコープ外のため）。
 */
export function validateScript(source: string, file: string): ValidateResult {
  try {
    parse(source, file)
    return { ok: true }
  } catch (e) {
    if (e instanceof WnError) return { ok: false, message: e.message }
    throw e
  }
}

// CLI: node tools/wn-compile/validate.ts <script.wn のパス>
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('使い方: node tools/wn-compile/validate.ts <script.wn のパス>')
    process.exit(1)
  }
  const source = readFileSync(file, 'utf8')
  const result = validateScript(source, file)
  if (result.ok) {
    console.log(`OK: ${file}`)
  } else {
    console.error(result.message)
    process.exit(1)
  }
}

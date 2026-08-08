import type { BacklogEntry } from '../core/state.ts'

/**
 * ネームプレートに出す名前を決める。
 * 話者未指定の「…」で始まる行は主人公の発話とみなす
 * （script-syntax の「記号なしの行は出さない / 「…」は @protagonist の名前」）。
 *
 * 本文とバックログで規則が食い違うと、同じ行の名前が画面によって変わる。
 */
export function displayName(entry: BacklogEntry, protagonist: string | null): string | null {
  if (entry.speaker !== null) return entry.speaker
  return entry.body.startsWith('「') ? protagonist : null
}

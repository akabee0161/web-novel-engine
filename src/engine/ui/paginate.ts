/**
 * 枠に収まる位置でテキストを区切り、各ページの先頭文字位置を返す。
 * 戻り値の先頭は常に 0。1ページで収まるなら `[0]`。
 *
 * host は測定用の要素で、本番の本文と同じ幅・フォント・行間を持つこと。
 * ページごとに二分探索するので、測定回数は O(ページ数 × log 文字数) に収まる。
 */
export function computePageBreaks(host: HTMLElement, text: string, maxHeight: number): number[] {
  host.textContent = text
  const node = host.firstChild
  if (!(node instanceof Text) || text.length === 0) return [0]

  // 高さ同士では比べない。Range の矩形はグリフの範囲であって行送りを含まないため、
  // 最終行の行送りぶん（line-height − 文字の高さ）だけ判定が甘くなり、枠から溢れる。
  // 行数で比べれば両辺が同じ尺度になる
  const lineHeight = parseFloat(getComputedStyle(host).lineHeight)
  const maxLines = Number.isFinite(lineHeight) && lineHeight > 0
    ? Math.max(1, Math.floor(maxHeight / lineHeight))
    : 1

  const range = document.createRange()
  const fits = (from: number, to: number): boolean => {
    range.setStart(node, from)
    range.setEnd(node, to)
    // プレーンなテキストノードでは1行につき1矩形。これが行数になる
    return range.getClientRects().length <= maxLines
  }

  const breaks = [0]
  let start = 0
  while (start < text.length) {
    if (fits(start, text.length)) break

    let lo = start + 1
    let hi = text.length
    let fit = start + 1        // 最低1文字は進める（無限ループ防止）
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fits(start, mid)) { fit = mid; lo = mid + 1 } else { hi = mid - 1 }
    }
    if (fit >= text.length) break
    breaks.push(fit)
    start = fit
  }
  return breaks
}

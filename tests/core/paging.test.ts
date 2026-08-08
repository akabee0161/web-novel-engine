import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

const script: CompiledScript = {
  title: 't', protagonist: null, assets: {},
  scenes: [{ id: 'A', steps: [
    { t: 'text', i: 0, h: 'a', speaker: null, body: '0123456789' },
    { t: 'text', i: 1, h: 'b', speaker: null, body: '次' },
  ] }],
}

function make() {
  const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/' })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  return r
}

const wait = (r: Runtime) => vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
const waitMeasure = (r: Runtime) =>
  vi.waitFor(() => expect(r.isWaitingForPageBreaks()).toBe(true))

/**
 * クリックして次のページまで進める。
 * `advance()` は待ちを解くだけで `phase` をその場では変えないため、
 * 「waiting になるまで」で待つと1ページも進まずに通ってしまう。
 */
async function nextPage(r: Runtime) {
  const before = r.getState().view.page.current
  r.advance()
  await vi.waitFor(() => {
    expect(r.getState().view.phase).toBe('waiting')
    expect(r.getState().view.page.current).not.toBe(before)
  })
}

describe('ページ送り', () => {
  it('ページ分割が無効なら1ページ扱いで全文が出る', async () => {
    const r = make()
    void r.start()
    await wait(r)
    expect(r.getState().view.page).toEqual({ current: 0, total: 1 })
    expect(r.getState().view.visibleChars).toBe(10)
  })

  it('境界を渡すとページごとに区切られ、クリックで次ページに進む', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    // UI 役として境界を返す
    await waitMeasure(r)
    r.setPageBreaks([0, 4, 8])
    await wait(r)

    expect(r.getState().view.page).toEqual({ current: 0, total: 3 })
    expect(r.getState().view.visibleChars).toBe(4)      // 0..3

    await nextPage(r)
    expect(r.getState().view.page.current).toBe(1)
    expect(r.getState().view.visibleChars).toBe(8)      // 0..7

    await nextPage(r)
    expect(r.getState().view.page.current).toBe(2)
    expect(r.getState().view.visibleChars).toBe(10)
  })

  it('最終ページのクリックで次の本文に進む', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([0, 5])
    await wait(r)
    await nextPage(r)          // 2ページ目
    r.advance()                // 最終ページのクリックで次の本文へ
    await waitMeasure(r)
    r.setPageBreaks([0])
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('次')
  })

  it('途中ページでもセーブでき、index は変わらない', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([0, 5])
    await wait(r)
    expect(r.canSave()).toBe(true)
    expect(r.makeSave().index).toBe(0)   // ページはセーブに現れない
  })

  it('先頭が 0 でない境界は 0 が補われる', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([4, 8])
    await wait(r)
    expect(r.getState().view.pageBreaks).toEqual([0, 4, 8])
    expect(r.getState().view.page.total).toBe(3)
  })

  it('ロードのリプレイ中は測定を待たない', async () => {
    const r = make()
    r.enablePagination()
    void r.load({ scene: 'A', index: 1, snapshot: r.getState().snapshot })
    // i:0 はリプレイで素通りし、i:1 の測定だけを待つ
    await waitMeasure(r)
    r.setPageBreaks([0])
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('次')
    expect(r.getState().view.backlog.map((e) => e.body)).toEqual(['0123456789', '次'])
  })

  it('ページ送りの途中でロードしても、打ち切られた側が状態を戻さない', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([0, 4, 8])
    await wait(r)
    expect(r.getState().view.page.current).toBe(0)

    void r.load({ scene: 'A', index: 1, snapshot: r.getState().snapshot })
    await waitMeasure(r)
    r.setPageBreaks([0])
    await wait(r)

    await new Promise((done) => setTimeout(done, 50))
    expect(r.getState().view.currentText?.body).toBe('次')
    expect(r.getState().view.page).toEqual({ current: 0, total: 1 })
  })
})

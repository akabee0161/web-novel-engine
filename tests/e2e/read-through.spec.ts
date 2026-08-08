import { expect, test, type Page } from '@playwright/test'

const FIRST_BODY = '放課後の部室は、いつも通り紙の匂いがした。'
const LAST_BODY = '「読んでくれた?」'
/** drafts/sample-short.wn の本文ブロック数 */
const TOTAL_BLOCKS = 63

const stage = (page: Page) => page.locator('.wn-stage')
const body = (page: Page) => page.locator('.wn-messagebox > div:last-child')
const speaker = (page: Page) => page.locator('.wn-speaker')
/** 手前に出ている背景レイヤ。data-bg に @bg の引数が入る */
const bgLayer = (page: Page) => page.locator('.wn-bg-in')

/** 出ている立ち絵を `id:表情:位置` の並びで取る */
const readSprites = (page: Page) =>
  page.locator('.wn-sprite').evaluateAll((els) =>
    els.map((el) => {
      const pos = /wn-sprite-(\w+)/.exec(el.className)?.[1] ?? '?'
      return `${el.getAttribute('data-sprite')}:${el.getAttribute('data-expr')}:${pos}`
    }),
  )

const phase = (page: Page) => stage(page).getAttribute('data-phase')

/** ステージのどこでもよいが、メッセージ枠を避けて上部を押す */
const tap = (page: Page) => stage(page).click({ position: { x: 640, y: 120 } })

async function startReading(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')
}

/** 文字送り中なら打ち切り、クリック待ちか終端になるまで待つ */
async function settle(page: Page) {
  if ((await phase(page)) === 'typing') await tap(page)
  await expect(stage(page)).toHaveAttribute('data-phase', /waiting|ended/)
}

/** 回想の画面効果がかかっているか */
const flashbackOn = (page: Page) =>
  page.locator('.wn-scene').evaluate((el) => el.classList.contains('wn-flashback'))

type Block = {
  body: string
  speaker: string | null
  bg: string | null
  sprites: string[]
  flashback: boolean
}

/** 台本を終端まで読み進め、通過した本文ブロックを記録する */
async function readAll(page: Page): Promise<Block[]> {
  const blocks: Block[] = []
  while (blocks.length < TOTAL_BLOCKS + 5) {
    await settle(page)
    if ((await phase(page)) === 'ended') break
    blocks.push({
      body: (await body(page).textContent()) ?? '',
      speaker: (await speaker(page).count()) ? await speaker(page).textContent() : null,
      bg: (await bgLayer(page).count()) ? await bgLayer(page).getAttribute('data-bg') : null,
      sprites: await readSprites(page),
      flashback: await flashbackOn(page),
    })
    await tap(page)
    // クリックが効いて次に移ったことを確かめてから、次の周回に入る
    await expect(async () => expect(await phase(page)).not.toBe('waiting')).toPass({ timeout: 5000 })
  }
  return blocks
}

test('タイトル画面に @title の文字列が出る', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.wn-title h1')).toHaveText('消えた一篇')
})

test('台本が最後まで通しで読める', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await startReading(page)
  const blocks = await readAll(page)

  expect(blocks[0].body).toBe(FIRST_BODY)
  expect(blocks.at(-1)?.body).toBe(LAST_BODY)
  expect(blocks).toHaveLength(TOTAL_BLOCKS)
  expect(errors).toEqual([])
})

test('ネームプレートは話者と主人公で出し分けられる', async ({ page }) => {
  await startReading(page)
  const blocks = await readAll(page)

  // `>ミカ` の行は話者名が出る
  expect(blocks.some((b) => b.speaker === 'ミカ')).toBe(true)
  // 話者なしの「…」は @protagonist の名前が出る
  expect(blocks.some((b) => b.speaker === 'ハル' && b.body.startsWith('「'))).toBe(true)
  // 地の文はネームプレートを出さない
  expect(blocks.some((b) => b.speaker === null && !b.body.startsWith('「'))).toBe(true)
})

test('文字送りは1文字ずつ進み、クリックで全文表示になって止まる', async ({ page }) => {
  await startReading(page)

  // 1文字 40ms なので FIRST_BODY は約 840ms で打ち終わる。
  // 計測に使う時間はその予算を大きく下回らせる（超えると tap が「打ち切り」ではなく
  // 「次のブロックへ送る」クリックになり、掴む本文がずれる）
  const samples: string[] = []
  for (let i = 0; i < 3; i++) {
    samples.push((await body(page).textContent()) ?? '')
    await page.waitForTimeout(60)
  }
  expect(samples.at(-1)!.length).toBeGreaterThan(samples[0].length)
  expect(samples.at(-1)!.length).toBeLessThan(FIRST_BODY.length)

  // クリックすると全文が出て、そこで止まる（次に進まない）
  // ここが typing でなければ以降の前提が崩れるので、先に明示して落とす
  expect(await phase(page)).toBe('typing')
  await tap(page)
  await expect(stage(page)).toHaveAttribute('data-phase', 'waiting')
  await expect(body(page)).toHaveText(FIRST_BODY)
  await page.waitForTimeout(200)
  await expect(body(page)).toHaveText(FIRST_BODY)

  // もう一度クリックすると次へ
  await tap(page)
  await expect(body(page)).not.toHaveText(FIRST_BODY)
})

test('背景は台本の @bg どおりに切り替わる', async ({ page }) => {
  await startReading(page)
  const blocks = await readAll(page)

  // 同じ背景が続く区間を畳んで、切り替わった順に並べる
  const order = blocks.map((b) => b.bg).filter((bg, i, all) => bg !== all[i - 1])
  expect(order).toEqual([
    'clubroom_day',      // 部室・放課後（部室・違和感 は @bg を持たないので持ち越し）
    'corridor_evening',  // 廊下
    'clubroom_day',      // 回想・昨日の部室
    'rooftop_door',      // 屋上前
    'black',             // 引き
  ])
})

test('立ち絵は @show / @hide どおりに出入りする', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))

  await startReading(page)
  const blocks = await readAll(page)

  // 同じ並びが続く区間を畳んで、変わった順に並べる
  const order = blocks
    .map((b) => b.sprites.join(' + '))
    .filter((s, i, all) => s !== all[i - 1])

  expect(order[0]).toBe('')                                  // 冒頭はまだ誰も出ていない
  expect(order[1]).toBe('mika:normal:center')                // @show mika normal pos:center
  expect(order).toContain('mika:smile:center')               // @show mika smile は位置を維持
  // トオルの登場と同時にミカが左へ寄る
  expect(order).toContain('mika:smile:left + tooru:normal:right')
  expect(order.at(-1)).toBe('')                              // 「引き」の @hide *
  // @hide * で空に戻ったあと、回想で再び出る
  expect(order.filter((s) => s === '').length).toBeGreaterThan(1)
  expect(order.filter((s) => s === 'mika:normal:center').length).toBeGreaterThan(1)

  // 素材の欠落は console.warn になる。ダミー素材が揃っている限り出ない
  expect(warnings).toEqual([])
})

test('@flashback on / off の区間だけ回想の画面効果がかかる', async ({ page }) => {
  await startReading(page)
  const blocks = await readAll(page)

  const on = blocks.flatMap((b, i) => (b.flashback ? [i] : []))
  expect(on.length).toBeGreaterThan(0)
  // 効果がかかる区間は1つながり（@flashback on … off が1組だけ）
  expect(on.at(-1)! - on[0]).toBe(on.length - 1)
  // 台本の「回想・昨日の部室」だけが対象。前後のブロックは素のまま
  expect(blocks[on[0] - 1].flashback).toBe(false)
  expect(blocks[on.at(-1)! + 1].flashback).toBe(false)
  // 回想は背景を持ち越した clubroom_day で起きる
  expect(blocks[on[0]].bg).toBe('clubroom_day')
})

test('演出中のクリックは待ちを打ち切るだけで、本文は飛ばさない', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめから' }).click()

  // 冒頭の @bg clubroom_day fade:600 の最中。まだ本文は出ていない
  await expect(stage(page)).toHaveAttribute('data-phase', 'performing')
  await expect(bgLayer(page)).toHaveAttribute('data-bg', 'clubroom_day')
  await expect(bgLayer(page)).toHaveCSS('animation-duration', '0.6s')
  await expect(page.locator('.wn-messagebox')).toHaveCount(0)

  // 打ち切られても飛ばされないので、出てくるのは1つ目の本文。
  // 「打ち切る」こと自体の時間的な検証は core のテストが持っている
  // （tests/core/steps.test.ts の「演出中のクリック」）
  await tap(page)
  await settle(page)
  await expect(body(page)).toHaveText(FIRST_BODY)
})

test('ステージは縦長でも横長でも 16:9 を保つ', async ({ page }) => {
  await page.goto('/')
  for (const size of [{ width: 900, height: 1400 }, { width: 1600, height: 500 }]) {
    await page.setViewportSize(size)
    const box = await stage(page).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width / box!.height).toBeCloseTo(16 / 9, 2)
  }
})

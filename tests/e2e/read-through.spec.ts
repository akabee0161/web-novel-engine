import { expect, test, type Page } from '@playwright/test'

const FIRST_BODY = '放課後の部室は、いつも通り紙の匂いがした。'
const LAST_BODY = '「読んでくれた?」'
/** drafts/sample-short.wn の本文ブロック数 */
const TOTAL_BLOCKS = 63

const stage = (page: Page) => page.locator('.wn-stage')
const body = (page: Page) => page.locator('.wn-messagebox > div:last-child')
const speaker = (page: Page) => page.locator('.wn-speaker')

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

type Block = { body: string; speaker: string | null }

/** 台本を終端まで読み進め、通過した本文ブロックを記録する */
async function readAll(page: Page): Promise<Block[]> {
  const blocks: Block[] = []
  while (blocks.length < TOTAL_BLOCKS + 5) {
    await settle(page)
    if ((await phase(page)) === 'ended') break
    blocks.push({
      body: (await body(page).textContent()) ?? '',
      speaker: (await speaker(page).count()) ? await speaker(page).textContent() : null,
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

  const samples: string[] = []
  for (let i = 0; i < 5; i++) {
    samples.push((await body(page).textContent()) ?? '')
    await page.waitForTimeout(90)
  }
  expect(samples.at(-1)!.length).toBeGreaterThan(samples[0].length)
  expect(samples.at(-1)!.length).toBeLessThan(FIRST_BODY.length)

  // クリックすると全文が出て、そこで止まる（次に進まない）
  await tap(page)
  await expect(stage(page)).toHaveAttribute('data-phase', 'waiting')
  await expect(body(page)).toHaveText(FIRST_BODY)
  await page.waitForTimeout(200)
  await expect(body(page)).toHaveText(FIRST_BODY)

  // もう一度クリックすると次へ
  await tap(page)
  await expect(body(page)).not.toHaveText(FIRST_BODY)
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

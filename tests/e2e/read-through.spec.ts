import { expect, test, type Locator, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** 音声の解禁を数えるための計測用。addInitScript が仕込む */
    __audioContexts?: number
    /** 実際にデコードした音声素材の数。0 なら検証が空振りしている */
    __decodedAudio?: number
    /** data-phase の変化を記録したもの。addInitScript が仕込む */
    __phases?: string[]
  }
}

const FIRST_BODY = '放課後の部室は、いつも通り紙の匂いがした。'
const LAST_BODY = '「読んでくれた?」'
/** drafts/sample-short.wn の本文ブロック数 */
const TOTAL_BLOCKS = 63

const stage = (page: Page) => page.locator('.wn-stage')
/** 表示中の本文。測定用の .wn-measure を掴まないよう、クラスで直接指す */
const body = (page: Page) => page.locator('.wn-body')
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

test('音声はタイトル画面のクリックで解禁され、台本の素材が読み込める', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))

  await page.addInitScript(() => {
    window.__audioContexts = 0
    window.__decodedAudio = 0
    const Original = window.AudioContext
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options)
        window.__audioContexts = (window.__audioContexts ?? 0) + 1
      }
    }
    const decode = Original.prototype.decodeAudioData
    Original.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer) {
      window.__decodedAudio = (window.__decodedAudio ?? 0) + 1
      return decode.call(this, data)
    }
  })

  await page.goto('/')
  // タイトル画面を出しただけでは AudioContext を作らない
  expect(await page.evaluate(() => window.__audioContexts)).toBe(0)

  await page.getByRole('button', { name: 'はじめから' }).click()
  expect(await page.evaluate(() => window.__audioContexts)).toBe(1)

  // 通しで読んでも、BGM / SE の読み込みが1つも失敗しない
  // （失敗すると audio.ts が console.warn する）
  const blocks = await readAll(page)
  expect(blocks).toHaveLength(TOTAL_BLOCKS)
  expect(warnings).toEqual([])
  // 台本には BGM 3種と SE 4種が出てくる。バッファは名前ごとに1回だけデコードされる
  expect(await page.evaluate(() => window.__decodedAudio)).toBe(7)
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

/** localStorage のシステムデータ。まだ書き出されていなければ null */
const systemData = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('wn:kieta-ippen:system')
    return raw ? (JSON.parse(raw) as { read: string[] }) : null
  })

/** 本文を n ブロック表示する。最後のブロックはクリックせずクリック待ちのまま残す */
async function readBlocks(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await settle(page)
    if (i === n - 1) break
    await tap(page)
    await expect(async () => expect(await phase(page)).not.toBe('waiting')).toPass({ timeout: 5000 })
  }
}

test('既読はセーブ操作なしに記録され、リロードしても残る', async ({ page }) => {
  await startReading(page)
  await readBlocks(page, 3)

  // セーブ操作は一度もしていない。それでも離脱時に書き出される
  await page.reload()
  const first = await systemData(page)
  expect(first?.read).toHaveLength(3)

  // 続きを読むと、前回の分を保ったまま伸びる
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')
  await readBlocks(page, 5)
  await page.reload()

  const second = await systemData(page)
  expect(second?.read).toHaveLength(5)
  expect(second!.read.slice(0, 3)).toEqual(first!.read)
})

/** drafts/sample-short.wn の第1シーンの本文ブロック数 */
const SCENE1_BLOCKS = 16

test('バックログはクリック待ちのときだけ開き、シーンをまたいで遡れる', async ({ page }) => {
  const history = page.getByRole('button', { name: '履歴' })

  await page.goto('/')
  await page.getByRole('button', { name: 'はじめから' }).click()

  // 冒頭の @bg のフェード中。演出中は導線ごと出さない
  await expect(stage(page)).toHaveAttribute('data-phase', 'performing')
  await expect(history).toHaveCount(0)

  // シーン境界をまたぐところまで読む
  const seen: string[] = []
  for (let i = 0; i < SCENE1_BLOCKS + 1; i++) {
    await settle(page)
    seen.push((await body(page).textContent()) ?? '')
    if (i === SCENE1_BLOCKS) break
    await tap(page)
    await expect(async () => expect(await phase(page)).not.toBe('waiting')).toPass({ timeout: 5000 })
  }
  const current = seen.at(-1)!

  await expect(history).toBeVisible()
  await history.click()

  // 表示済みの本文が、シーンをまたいで並ぶ
  const items = page.locator('.wn-backlog-item')
  await expect(items).toHaveCount(seen.length)
  // 各行はネームプレートの名前を先頭に持つので、本文を含むことだけを見る
  const texts = await items.allTextContents()
  for (const [n, expected] of seen.entries()) expect(texts[n]).toContain(expected)
  expect(texts[0]).toContain(FIRST_BODY)
  expect(texts.at(-1)).toContain(current)

  // 閉じると元の位置のまま。読み返しは進行位置を動かさない
  await page.getByRole('button', { name: '閉じる' }).click()
  await expect(page.locator('.wn-overlay')).toHaveCount(0)
  await expect(body(page)).toHaveText(current)
  await tap(page)
  await settle(page)
  await expect(body(page)).not.toHaveText(current)
})

/** セーブ/ロードのスロット。並びは runtime.saveSlots（auto, 1, 2, 3） */
const slot = (page: Page, n: number) => page.locator('.wn-slot').nth(n)

test('セーブした画面が、リロードをまたいで「つづきから」で再現される', async ({ page }) => {
  await startReading(page)

  // シーン境界をまたぐところまで読む。背景と立ち絵の持ち越しごと復元されることを見る
  for (let i = 0; i < SCENE1_BLOCKS; i++) {
    await settle(page)
    await tap(page)
    await expect(async () => expect(await phase(page)).not.toBe('waiting')).toPass({ timeout: 5000 })
  }
  await settle(page)

  const saved = {
    body: await body(page).textContent(),
    bg: await bgLayer(page).getAttribute('data-bg'),
    sprites: await readSprites(page),
  }
  expect(saved.sprites.length).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'セーブ' }).click()
  await slot(page, 1).click()
  await expect(page.locator('.wn-overlay')).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: 'つづきから' }).click()
  await slot(page, 1).click()
  await settle(page)

  expect(await body(page).textContent()).toBe(saved.body)
  expect(await bgLayer(page).getAttribute('data-bg')).toBe(saved.bg)
  expect(await readSprites(page)).toEqual(saved.sprites)

  // リプレイは現在シーンの入口から走る。セーブ位置はそのシーンの先頭ブロックなので、
  // バックログはそこまでの1件だけになる（前のシーンの分は遡れない）
  await page.getByRole('button', { name: '履歴' }).click()
  await expect(page.locator('.wn-backlog-item')).toHaveCount(1)
})

test('オートセーブはクリック待ちに到達するたびに打たれる', async ({ page }) => {
  await startReading(page)
  await settle(page)

  const auto = await page.evaluate(() => localStorage.getItem('wn:kieta-ippen:save:auto'))
  expect(auto).not.toBeNull()
  expect(JSON.parse(auto!)).toMatchObject({ scene: '部室・放課後', index: 0 })
})

test('台本に存在しないシーンのセーブは、黙って飛ばずに失敗として出る', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss() })

  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('wn:kieta-ippen:save:2', JSON.stringify({
      scene: '消えたシーン',
      index: 0,
      snapshot: { bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {} },
      savedAt: Date.now(),
      preview: '…',
    }))
  })
  await page.reload()

  await page.getByRole('button', { name: 'つづきから' }).click()
  await slot(page, 2).click()

  await expect(async () => expect(dialogs).toHaveLength(1)).toPass({ timeout: 5000 })
  expect(dialogs[0]).toContain('消えたシーン')
  // タイトル画面に戻る。別の位置から始まったりしない
  await expect(page.locator('.wn-title')).toBeVisible()
})

/** 台本の最初の `@speed slow` が効く本文までのブロック数（シーン2の3つ目） */
const BLOCKS_TO_SPEED_SLOW = SCENE1_BLOCKS + 3

test('一括表示にすると @speed の区間でも文字が流れず、設定はリロードをまたぐ', async ({ page }) => {
  // data-phase の変化を残す。typing が1度も出ないことで「流れていない」を示す
  await page.addInitScript(() => {
    window.__phases = []
    const attach = () => {
      const el = document.querySelector('.wn-stage')
      if (!el) { requestAnimationFrame(attach); return }
      const record = () => {
        const p = el.getAttribute('data-phase')
        if (p) window.__phases!.push(p)
      }
      record()
      new MutationObserver(record).observe(el, { attributes: true, attributeFilter: ['data-phase'] })
    }
    requestAnimationFrame(attach)
  })

  await page.goto('/')
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByRole('button', { name: '一括表示' }).click()

  // 一括表示のあいだは @speed ごと無視されるので、速さの選択肢を出す意味がない
  await expect(page.getByRole('button', { name: '普通', exact: true })).toBeDisabled()

  await page.getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')

  // 一括表示では data-phase が waiting のまま変わらない（文字送りの区間が無い）ので、
  // 進んだことは本文の変化で待ち合わせる
  for (let i = 0; i < BLOCKS_TO_SPEED_SLOW; i++) {
    const before = (await body(page).textContent()) ?? ''
    await tap(page)
    await expect(body(page)).not.toHaveText(before)
  }

  const phases = await page.evaluate(() => window.__phases ?? [])
  expect(phases).toContain('waiting')
  expect(phases).not.toContain('typing')

  // リロードしても残る（設定は変更のたびに書き出される）
  await page.reload()
  await page.getByRole('button', { name: '設定' }).click()
  await expect(page.getByRole('button', { name: '一括表示' })).toHaveClass(/is-on/)
})

test('枠に収まらない本文はページに分かれ、文字を落とさずに送られる', async ({ page }) => {
  await page.goto('/')
  // 台本を書き換えずにページ送りを踏むため、文字を大きくして枠に収まらなくする。
  // .wn-body と .wn-measure の両方が .wn-messagebox の font-size を継承する
  await page.addStyleTag({ content: '.wn-messagebox { font-size: 5cqw !important; }' })
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')

  const indicator = page.locator('.wn-page')
  const pages: string[] = []
  for (;;) {
    await settle(page)
    pages.push((await body(page).textContent()) ?? '')
    const [current, total] = (await indicator.textContent())!.split('/').map((s) => Number(s))
    if (current === total) break
    await tap(page)
    await expect(indicator).toHaveText(`${current + 1} / ${total}`)
  }

  expect(pages.length).toBeGreaterThan(1)
  // ページの継ぎ目で文字が落ちても重複してもいけない
  expect(pages.join('')).toBe(FIRST_BODY)

  // 最終ページのクリックで次の本文に進む
  await tap(page)
  await settle(page)
  expect(await body(page).textContent()).not.toBe(pages.at(-1))
})

test('開発用の ?scene=&index= で途中から始められる', async ({ page }) => {
  await page.goto('/?scene=' + encodeURIComponent('屋上前') + '&index=2')
  await page.getByRole('button', { name: 'はじめから' }).click()
  await settle(page)

  expect(await body(page).textContent()).toBe('「じゃあ確認すれば──」')
  // セーブの復元と同じ経路を通るので、シーン入口からのリプレイで演出が効いている
  await expect(bgLayer(page)).toHaveAttribute('data-bg', 'rooftop_door')
  expect(await readSprites(page)).not.toEqual([])
})

test('存在しないシーンを指定したら、黙って先頭から始めずに失敗として出る', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss() })

  await page.goto('/?scene=' + encodeURIComponent('無いシーン'))
  await page.getByRole('button', { name: 'はじめから' }).click()

  await expect(async () => expect(dialogs).toHaveLength(1)).toPass({ timeout: 5000 })
  expect(dialogs[0]).toContain('無いシーン')
  await expect(page.locator('.wn-title')).toBeVisible()
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

/** 計算後のスタイルを数値で取る。'33.28px' → 33.28 */
const cssPx = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => parseFloat(getComputedStyle(el).getPropertyValue(p)), prop)

/**
 * 寸法は基準解像度に対する比で決まる。1280 幅なら本文は 2.6% = 33.28px。
 * 倍率変数（--wn-u）を入れても横持ちの見た目が変わらないことを、この数字で押さえる。
 */
test('横持ちの寸法はステージ幅に対する比で決まる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  // .wn-speaker は本文ブロックに話者がいないと出ない。FIRST_BODY は地の文なので、
  // 話者（トオル）がいる屋上前シーンの3ブロック目から始める
  await page.goto('/?scene=' + encodeURIComponent('屋上前') + '&index=2')

  expect(await cssPx(page.locator('.wn-title h1'), 'font-size')).toBeCloseTo(76.8, 1)
  expect(await cssPx(page.locator('.wn-title .wn-button').first(), 'font-size')).toBeCloseTo(30.72, 1)

  await page.getByRole('button', { name: '設定' }).click()
  expect(await cssPx(page.locator('.wn-panel'), 'width')).toBeCloseTo(1024, 0)
  expect(await cssPx(page.locator('.wn-panel'), 'font-size')).toBeCloseTo(28.16, 1)
  await page.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')
  expect(await cssPx(page.locator('.wn-messagebox'), 'font-size')).toBeCloseTo(33.28, 1)
  expect(await cssPx(page.locator('.wn-body'), 'height')).toBeCloseTo(192, 0)
  expect(await cssPx(page.locator('.wn-speaker'), 'font-size')).toBeCloseTo(28.16, 1)

  // .wn-body と .wn-measure は同じ幅でなければならない（片方だけ直すとページ測定がずれる）
  const bodyWidth = await cssPx(page.locator('.wn-body'), 'width')
  expect(await cssPx(page.locator('.wn-measure'), 'width')).toBeCloseTo(bodyWidth, 1)
})

/**
 * 立ち絵の高さは「場面」の 88%。横持ちでは場面＝ステージなので現状と同じ値になるが、
 * 縦持ちで場面が上半分になったときに巨大化しないための基準はここにある。
 */
test('立ち絵の高さは場面の 88%', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?scene=' + encodeURIComponent('屋上前') + '&index=2')
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-sprite')

  const scene = (await page.locator('.wn-scene').boundingBox())!
  const sprite = (await page.locator('.wn-sprite').first().boundingBox())!
  expect(sprite.height).toBeCloseTo(scene.height * 0.88, 0)
})

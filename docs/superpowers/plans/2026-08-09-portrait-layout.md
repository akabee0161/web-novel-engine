# モバイル縦持ちレイアウト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スマートフォンの縦持ちで、画面の上半分を場面（背景＋立ち絵）、下半分を本文枠に分割し、
文字が読める大きさになり、回転してもページの割り直しで読んでいた位置が保たれるようにする。

**Architecture:** 横持ちは現状の 16:9 レターボックスのまま一切変えない。
CSS は `--wn-u` という倍率変数を1つ入れて既存の係数（2.6 / 2.2 / 1.9 …）をそのまま残し、
縦持ちだけ `@media (orientation: portrait)` で倍率と構造を差し替える。
コアには「クリック待ちの瞬間だけ、現在ページの先頭から測り直す」経路（`requestRepaginate()` /
`view.measureFrom`）を足し、UI が `matchMedia('(orientation: portrait)')` の変化で叩く。

**Tech Stack:** TypeScript / React 19 / Vite / CSS コンテナクエリ（`container-type: size`, `cqw`, `cqh`）
/ Vitest（jsdom なし）/ Playwright

**設計の出典:** [`docs/superpowers/specs/2026-08-09-portrait-layout-design.md`](../specs/2026-08-09-portrait-layout-design.md)
（作成時点のログ。書き換えない）

## Global Constraints

- **Node 22 以上。** `import.meta.dirname` を使う設定ファイルがある
- **`src/engine/core/**` は React も DOM も import しない。** 向きの検知は UI 層の責務。ESLint が機械的に落とす
- **エンジンの状態は `EngineState` の1箇所だけ。** 新しい状態は `snapshot` / `progress` / `view` のどれかに必ず置く
- **配列は mutate せず置き換える。** `emit()` は3層を浅くコピーするだけ
- **演出の待ち時間はコアが持つ。** `transitionend` で完了を判定しない
- エラーメッセージ・コメント・ドキュメントは**日本語**
- コミットは Conventional Commits（`feat:` / `fix:` / `test:` / `chore:` / `docs:`）。**1タスク1コミット**
- **コミット前に必ず一度止めてユーザーの確認を取る。** docs だけの修正でも編集からコミットまで一続きにしない
- 各タスクの完了条件は `npm run typecheck && npm run lint && npm test` が通ること。
  DOM に関わるタスク（Task 1・2・3・5）は `npm run test:e2e` も通ること
- パイプすると exit code が隠れる。`| tail` を付けるなら `set -o pipefail` を併用する

## 設計ドキュメントからの逸脱（着手前に確定）

| 箇所 | 設計ドキュメントの記述 | 本計画 | 理由 |
|---|---|---|---|
| 検証表の Playwright 1行目 | 「縦長ビューポートで**場面が 16:9**であること」 | 「縦長ビューポートでステージがビューポート全体、**場面の高さがステージの 50%**であること」 | 同ドキュメントの決定2の表と矛盾する。iPhone 14 の場面枠は 390×422（比 0.92）であり 16:9 にならない。16:9 なのは**横持ちのステージ**と**背景素材そのもの**だけ |
| 例外表の `.wn-body { height: 15cqw }` | 「変数化から外れる」 | `calc(15 * var(--wn-u))` に変数化したうえで、縦持ちでは `flex` で上書きする | 横持ちでは `--wn-u: 1cqw` なので値は完全に同一。縦持ちで可変にするという趣旨は満たす |
| — | （記載なし） | 再測定の直後の1ページ目は文字送りをやり直さず即座に全文を出す | 回すたびに読んでいた段落が打ち直されるのは演出ではなく事故に見えるため。`type()` に `instant` 引数を足す |
| — | （記載なし） | `requestRepaginate()` は `paginate` が無効なときも無視する | 測れる UI が無いと `waitForPageBreaks()` が即座に返り、クリック待ちを解いただけで本文が1つ進んでしまう |

`docs/decisions/2026-08-09-implementation-decisions.md` は**書き換えない。**
Task 6 で新しい決定記録を足す。

## ファイル構成

| ファイル | 変更 | 責務 |
|---|---|---|
| `src/engine/ui/style.css` | 修正 | 倍率変数 `--wn-u`、`.wn-scene` のコンテナ化、`.wn-msg-area`、縦持ちのメディアクエリ |
| `src/engine/ui/App.tsx` | 修正 | `.wn-msg-area` ラッパの追加、向きの変化の購読 |
| `src/engine/ui/MessageBox.tsx` | 修正 | `view.measureFrom` 以降だけを測る |
| `src/engine/core/state.ts` | 修正 | `view.measureFrom` を追加 |
| `src/engine/core/runtime.ts` | 修正 | `requestRepaginate()`、`execText` のページループの多重化、`type()` の `instant` |
| `tests/core/paging.test.ts` | 修正 | 再測定の Vitest |
| `tests/e2e/read-through.spec.ts` | 修正 | 横持ちの寸法回帰、縦持ちレイアウト、回転、16:9 テストの書き替え |
| `docs/decisions/2026-08-09-portrait-layout.md` | 新規 | 決定3を覆す経緯 |
| `docs/architecture.md` / `docs/engine-spec.md` / `docs/status.md` / `README.md` | 修正 | 正典の更新 |

`src/engine/ui/Stage.tsx` は**変更しない。** `.wn-scene` は既にそこにある。

---

### Task 1: 寸法の倍率を `--wn-u` に切り出す（横持ちの見た目は不変）

`cqw` 直書きを `calc(N * var(--wn-u))` に置き換えるだけのリファクタ。
`--wn-u: 1cqw` なので**計算結果は 1 ピクセルも変わらない。**
先に「変わっていないこと」を固定する回帰テストを書いてから置き換える。

**Files:**
- Test: `tests/e2e/read-through.spec.ts`（テストを1つ追加）
- Modify: `src/engine/ui/style.css`

**Interfaces:**
- Consumes: なし
- Produces: `.wn-stage` の CSS カスタムプロパティ `--wn-u`（初期値 `1cqw`）。
  以降のタスクはすべての寸法をこの変数の係数として書く

- [ ] **Step 1: 横持ちの寸法を固定する回帰テストを書く**

`tests/e2e/read-through.spec.ts` の import 行を差し替える。

```ts
import { expect, test, type Locator, type Page } from '@playwright/test'
```

ファイル末尾（`test('ステージは縦長でも横長でも 16:9 を保つ', ...)` の後ろ）に足す。

```ts
/** 計算後のスタイルを数値で取る。'33.28px' → 33.28 */
const cssPx = (loc: Locator, prop: string) =>
  loc.evaluate((el, p) => parseFloat(getComputedStyle(el).getPropertyValue(p)), prop)

/**
 * 寸法は基準解像度に対する比で決まる。1280 幅なら本文は 2.6% = 33.28px。
 * 倍率変数（--wn-u）を入れても横持ちの見た目が変わらないことを、この数字で押さえる。
 */
test('横持ちの寸法はステージ幅に対する比で決まる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')

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
```

- [ ] **Step 2: テストが現状で通ることを確認する（リファクタ前の基準）**

```bash
npm run test:e2e -- -g '横持ちの寸法'
```

期待: PASS。ここで落ちるなら期待値の計算が間違っているので、
`toBeCloseTo` の数字を実測に合わせてから先へ進む（`.wn-speaker` は本文ブロックに
話者がいないと出ない。落ちたら `startReading` 後に `settle` を挟むか、
`?scene=屋上前&index=2` から始める形に直す）。

- [ ] **Step 3: `--wn-u` を定義し、`cqw` を係数に置き換える**

`src/engine/ui/style.css`。`.wn-stage` に変数を足す。

```css
.wn-stage {
  position: relative;
  width: min(100vw, calc(100dvh * 16 / 9));
  height: min(100dvh, calc(100vw * 9 / 16));
  /* 内部の寸法はすべてこの倍率の係数で書く。横持ちは 1cqw = ステージ幅の 1%。
     縦持ちだけメディアクエリで倍率を差し替えるので、係数は1箇所も書き換えなくてよい。
     場面（.wn-scene）の内側では使わないこと。コンテナが変わり基準がずれる */
  --wn-u: 1cqw;
  container-type: size;
  overflow: hidden;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
  color: #f2f2f2;
  cursor: pointer;
}
```

以下、`cqw` を機械的に `calc(N * var(--wn-u))` へ置き換える。
**`cqh` は置き換えない**（`88cqh` / `82cqh` は高さ基準であり倍率の対象外）。
`.wn-panel { width: 80cqw }` と `.wn-slot` の `grid-template-columns` も
**このタスクでは置き換えない**（Task 3 で縦持ち専用の値を与える）。

```css
.wn-title {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(4 * var(--wn-u));
  background: #12141c;
}
.wn-title h1 { margin: 0; font-size: calc(6 * var(--wn-u)); font-weight: 600; letter-spacing: 0.1em; }
.wn-title-buttons { display: flex; gap: calc(2 * var(--wn-u)); }
.wn-button {
  padding: calc(1.4 * var(--wn-u)) calc(4 * var(--wn-u));
  font: inherit;
  font-size: calc(2.4 * var(--wn-u));
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.08);
  border: calc(0.15 * var(--wn-u)) solid rgba(255, 255, 255, 0.35);
  border-radius: calc(0.8 * var(--wn-u));
  cursor: pointer;
}
.wn-button:disabled { opacity: 0.35; cursor: default; }

.wn-messagebox {
  position: absolute;
  left: calc(5 * var(--wn-u)); right: calc(5 * var(--wn-u)); bottom: calc(4 * var(--wn-u));
  min-height: calc(21 * var(--wn-u));
  padding: calc(3 * var(--wn-u));
  background: rgba(8, 10, 16, 0.78);
  border-radius: calc(1 * var(--wn-u));
  font-size: calc(2.6 * var(--wn-u));
  line-height: 1.75;
}
/* .wn-body と .wn-measure は同じ幅・フォントサイズ・行間でなければならない。
   片方だけ変えるとページの測定がずれる。幅は両方とも padding と同じ式を使うこと */
.wn-body { height: calc(15 * var(--wn-u)); overflow: hidden; white-space: pre-wrap; }
.wn-measure {
  position: absolute;
  left: calc(3 * var(--wn-u)); right: calc(3 * var(--wn-u));
  top: calc(3 * var(--wn-u));
  visibility: hidden;
  pointer-events: none;
  white-space: pre-wrap;
}
.wn-page {
  position: absolute;
  right: calc(2 * var(--wn-u)); bottom: calc(1 * var(--wn-u));
  font-size: calc(1.6 * var(--wn-u));
  opacity: 0.6;
}

.wn-speaker {
  position: absolute;
  top: calc(-3.4 * var(--wn-u)); left: calc(2 * var(--wn-u));
  padding: calc(0.5 * var(--wn-u)) calc(2 * var(--wn-u));
  font-size: calc(2.2 * var(--wn-u));
  background: rgba(8, 10, 16, 0.92);
  border-radius: calc(0.7 * var(--wn-u));
}

/* クリック待ちのときだけ出る操作ボタン群 */
.wn-corner {
  position: absolute;
  top: calc(2 * var(--wn-u)); right: calc(2 * var(--wn-u));
  display: flex;
  gap: calc(1 * var(--wn-u));
}
.wn-corner .wn-button {
  font-size: calc(1.8 * var(--wn-u));
  padding: calc(0.8 * var(--wn-u)) calc(2 * var(--wn-u));
}

.wn-panel {
  width: 80cqw;
  max-height: 82cqh;
  display: flex;
  flex-direction: column;
  gap: calc(2 * var(--wn-u));
  padding: calc(3 * var(--wn-u));
  background: #141821;
  border-radius: calc(1 * var(--wn-u));
  font-size: calc(2.2 * var(--wn-u));
}
.wn-panel-head { display: flex; justify-content: space-between; align-items: center; }
.wn-backlog-list { overflow-y: auto; line-height: 1.8; }
.wn-backlog-item { margin: 0 0 calc(1.4 * var(--wn-u)); }
.wn-backlog-name { display: inline-block; margin-right: calc(1 * var(--wn-u)); opacity: 0.7; }

.wn-slots { display: flex; flex-direction: column; gap: calc(1.2 * var(--wn-u)); overflow-y: auto; }
.wn-slot {
  display: grid;
  grid-template-columns: 12cqw 16cqw 1fr auto;
  gap: calc(1.5 * var(--wn-u));
  align-items: baseline;
  padding: calc(1.4 * var(--wn-u)) calc(2 * var(--wn-u));
  font: inherit;
  font-size: calc(1.9 * var(--wn-u));
  text-align: left;
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.06);
  border: calc(0.12 * var(--wn-u)) solid rgba(255, 255, 255, 0.2);
  border-radius: calc(0.6 * var(--wn-u));
  cursor: pointer;
}
.wn-slot:disabled { opacity: 0.35; cursor: default; }
.wn-slot-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.wn-slot-time, .wn-slot-empty { opacity: 0.55; font-size: calc(1.6 * var(--wn-u)); }

.wn-setting-row {
  display: grid;
  grid-template-columns: calc(18 * var(--wn-u)) 1fr;
  gap: calc(2 * var(--wn-u));
  align-items: center;
}
.wn-choices { display: flex; gap: calc(1 * var(--wn-u)); }
.wn-choice {
  padding: calc(0.8 * var(--wn-u)) calc(2 * var(--wn-u));
  font: inherit;
  font-size: calc(1.9 * var(--wn-u));
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.06);
  border: calc(0.12 * var(--wn-u)) solid rgba(255, 255, 255, 0.2);
  border-radius: calc(0.6 * var(--wn-u));
  cursor: pointer;
}
.wn-choice.is-on { background: rgba(255, 255, 255, 0.28); }
.wn-choice:disabled { opacity: 0.35; cursor: default; }
```

置き換え漏れが無いか確認する。残ってよい `cqw` は `.wn-panel` の `width: 80cqw` と
`.wn-slot` の `grid-template-columns` だけ。

```bash
grep -n 'cqw' src/engine/ui/style.css | grep -v 'var(--wn-u)' | grep -v -- '--wn-u:'
```

- [ ] **Step 4: 回帰テストと既存の E2E がすべて通ることを確認する**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

期待: すべて PASS（Playwright は 20 件になる）。

- [ ] **Step 5: ユーザーの確認を取ってからコミットする**

差分を見せ、確認を取ってから実行する。

```bash
git add src/engine/ui/style.css tests/e2e/read-through.spec.ts
git commit -m "refactor: 画面の寸法の倍率を --wn-u に切り出す"
```

---

### Task 2: 場面をコンテナ化し、本文枠のラッパを新設する（横持ちの見た目は不変）

立ち絵の `88cqh` の基準を「ステージ」から「場面」へ移し、本文枠を `.wn-msg-area` で包む。
横持ちでは場面とステージが同寸・ラッパが `inset: 0` なので**結果は完全に一致する。**
縦持ちの構造をここで先に用意しておく。

**Files:**
- Test: `tests/e2e/read-through.spec.ts`（テストを1つ追加）
- Modify: `src/engine/ui/style.css`
- Modify: `src/engine/ui/App.tsx:88`

**Interfaces:**
- Consumes: Task 1 の `--wn-u`
- Produces: `.wn-scene`（`container-type: size` を持つ）と `.wn-msg-area`（本文枠のラッパ）の2つの DOM 契約。
  Task 3 の縦持ちレイアウトはこの2つを組み替える

- [ ] **Step 1: 立ち絵の高さが「場面」基準であることを固定するテストを書く**

`tests/e2e/read-through.spec.ts` の末尾に足す。

```ts
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
```

- [ ] **Step 2: テストが現状で通ることを確認する（変更前の基準）**

```bash
npm run test:e2e -- -g '立ち絵の高さは場面'
```

期待: PASS（`.wn-scene` は現状ステージと同寸なので 720 × 0.88 = 633.6）。

- [ ] **Step 3: `.wn-scene` をコンテナにし、`.wn-msg-area` を足す**

`src/engine/ui/style.css`。`.wn-scene` の行を差し替える。

```css
/* 「場面」＝背景と立ち絵の領域。ここをコンテナにすることで、立ち絵の 88cqh が
   ステージではなく場面を基準に解決される。横持ちでは場面とステージが同寸なので
   結果は変わらないが、縦持ちで場面が上半分になったときに効いてくる。
   場面の内側で --wn-u を使ってはいけない（基準が場面になり倍率がずれる） */
.wn-scene {
  position: absolute;
  inset: 0;
  container-type: size;
  transition: filter 600ms linear;
}

/* 本文枠のラッパ。横持ちではステージ全面に敷くだけで、枠の位置は .wn-messagebox が持つ。
   縦持ちでは場面の下の残り全部を占める箱になる。
   透過部分のクリックが下に抜けるよう pointer-events を切る */
.wn-msg-area { position: absolute; inset: 0; pointer-events: none; }
```

`.wn-messagebox` にクリックを戻す1行を足す（`position: absolute;` の次の行）。

```css
.wn-messagebox {
  position: absolute;
  pointer-events: auto;
  left: calc(5 * var(--wn-u)); right: calc(5 * var(--wn-u)); bottom: calc(4 * var(--wn-u));
```

- [ ] **Step 4: `App.tsx` で MessageBox をラッパで包む**

`src/engine/ui/App.tsx` の 88 行目。

```tsx
            <Stage runtime={runtime} state={state} />
            <div className="wn-msg-area">
              <MessageBox runtime={runtime} state={state} />
            </div>
```

- [ ] **Step 5: 横持ちの見た目が変わっていないことを確認する**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

期待: すべて PASS（Playwright 21 件）。特に Task 1 の
「横持ちの寸法はステージ幅に対する比で決まる」が通り続けること。

- [ ] **Step 6: ユーザーの確認を取ってからコミットする**

```bash
git add src/engine/ui/style.css src/engine/ui/App.tsx tests/e2e/read-through.spec.ts
git commit -m "refactor: 場面をコンテナ化し、本文枠のラッパを新設する"
```

---

### Task 3: 縦持ちを上下分割にする

`@media (orientation: portrait)` で、ステージをビューポート全体に広げ、
場面を高さの 50%、残り全部を本文枠にする。倍率は 1.7 倍。

**Files:**
- Test: `tests/e2e/read-through.spec.ts`（既存テスト1件を書き替え、2件追加、`tap` を差し替え）
- Modify: `src/engine/ui/style.css`

**Interfaces:**
- Consumes: Task 1 の `--wn-u`、Task 2 の `.wn-scene` / `.wn-msg-area`
- Produces: 縦持ちのレイアウト。`.wn-body` の高さが可変になるので、
  Task 5 の再測定はこの高さを測ることになる

- [ ] **Step 1: `tap` をステージ幅に対する相対位置に変える**

現状の `tap` は `x: 640, y: 120` の絶対座標で、390px 幅の縦持ちでは
ステージの外を指してクリックが失敗する。`tests/e2e/read-through.spec.ts` の
`tap` の定義（`const tap = (page: Page) => ...` の行）を差し替える。

```ts
/** ステージのどこでもよいが、メッセージ枠を避けて上部を押す。
    縦持ちでも枠の外に当たるよう、絶対座標ではなくステージ幅に対する比で指す */
const tap = async (page: Page) => {
  const box = (await stage(page).boundingBox())!
  await stage(page).click({ position: { x: box.width * 0.5, y: box.height * 0.15 } })
}
```

呼び出し側はすべて `await tap(page)` なので変更不要。

- [ ] **Step 2: 縦持ちのレイアウトを検証するテストを書き、既存の 16:9 テストを書き替える**

既存の `test('ステージは縦長でも横長でも 16:9 を保つ', ...)` を**丸ごと**次で置き換える。

```ts
test('横持ちはステージが 16:9、縦持ちはビューポート全体を使う', async ({ page }) => {
  await page.goto('/')

  // 横長: ステージが 16:9 でレターボックスされる
  await page.setViewportSize({ width: 1600, height: 500 })
  const wide = (await stage(page).boundingBox())!
  expect(wide.width / wide.height).toBeCloseTo(16 / 9, 2)

  // 縦長: レターボックスをやめ、ビューポート全体をステージにする
  await page.setViewportSize({ width: 900, height: 1400 })
  const tall = (await stage(page).boundingBox())!
  expect(tall.width).toBeCloseTo(900, 0)
  expect(tall.height).toBeCloseTo(1400, 0)
})
```

続けて末尾に2件足す。

```ts
/** iPhone 14 相当。設計ドキュメントの表と同じ数字を検証する */
test('縦持ちは上下 50:50 に分割され、下は全部が本文枠になる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')

  const st = (await stage(page).boundingBox())!
  expect(st.width).toBeCloseTo(390, 0)
  expect(st.height).toBeCloseTo(844, 0)

  // 場面は画面高の 50%。16:9 ではない（背景は cover で左右が切れる）
  const scene = (await page.locator('.wn-scene').boundingBox())!
  expect(scene.width).toBeCloseTo(390, 0)
  expect(scene.height).toBeCloseTo(422, 0)

  // 場面の下は黒を残さず、全部を本文枠の領域が使う
  const area = (await page.locator('.wn-msg-area').boundingBox())!
  expect(area.y).toBeCloseTo(scene.y + scene.height, 0)
  expect(area.height).toBeCloseTo(844 - 422, 0)

  // 文字は横持ち相当まで拡大される（係数 2.6 × 倍率 1.7）
  expect(await cssPx(page.locator('.wn-messagebox'), 'font-size')).toBeCloseTo(390 * 0.026 * 1.7, 1)
  // 測定用の要素は本文と同じ幅でなければならない
  const bodyWidth = await cssPx(page.locator('.wn-body'), 'width')
  expect(await cssPx(page.locator('.wn-measure'), 'width')).toBeCloseTo(bodyWidth, 1)
  // 本文は枠の残り全部を使う（横持ちの固定高ではない）
  expect(await cssPx(page.locator('.wn-body'), 'height')).toBeGreaterThan(200)
})

test('縦持ちでも立ち絵は場面の 88% に収まる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?scene=' + encodeURIComponent('屋上前') + '&index=2')
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-sprite')

  const scene = (await page.locator('.wn-scene').boundingBox())!
  const sprite = (await page.locator('.wn-sprite').first().boundingBox())!
  expect(sprite.height).toBeCloseTo(scene.height * 0.88, 0)
  // 場面からはみ出さない
  expect(sprite.height).toBeLessThan(scene.height)
})
```

- [ ] **Step 3: テストが落ちることを確認する**

```bash
npm run test:e2e -- -g '縦持ち'
```

期待: FAIL。`ステージ` の高さが 844 ではなく 219（= 390 × 9/16）になる。

- [ ] **Step 4: 縦持ちのメディアクエリを書く**

`src/engine/ui/style.css` の末尾に足す。

```css
/* 縦持ちは上下分割にする。ステージをビューポート全体に広げ、上半分を場面、
   残り全部を本文枠が使う。背景は cover のままなので左右は切れる（最大 49%）。
   「上下比を固定する」と「切れる量を固定する」は両立しないため、前者を採った。
   詳細は docs/superpowers/specs/2026-08-09-portrait-layout-design.md */
@media (orientation: portrait) {
  .wn-stage {
    /* 倍率だけを差し替える。係数（2.6 / 2.2 / 1.9 …）は横持ちと共有したまま。
       1.7 は「同じ端末を横持ちにしたときの文字サイズに揃う」値 */
    --wn-u: 1.7cqw;
    width: 100vw;
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  /* 50cqh は .wn-scene 自身ではなく祖先コンテナ ＝ .wn-stage に対して解決される */
  .wn-scene { position: relative; inset: auto; width: 100%; height: 50cqh; flex: none; }

  .wn-msg-area { position: relative; inset: auto; flex: 1 1 auto; min-height: 0; display: flex; }

  .wn-messagebox {
    position: relative;
    left: auto; right: auto; bottom: auto;
    flex: 1 1 auto;
    min-height: 0;
    /* 上の余白は話者名（top: -3.4u）が場面に食い込まない大きさにする */
    margin: calc(4.5 * var(--wn-u)) calc(3 * var(--wn-u)) calc(3 * var(--wn-u));
    display: flex;
    flex-direction: column;
  }

  /* 本文は枠の残り全部。幅は padding と同じ式のままなので .wn-measure とずれない */
  .wn-body { height: auto; flex: 1 1 auto; min-height: 0; }

  /* 幅 390px に3つ並べると溢れる */
  .wn-title-buttons { flex-wrap: wrap; justify-content: center; }

  .wn-panel { width: 92cqw; }

  /* 横4列は入らないので、名前と場所を1行目、本文と時刻を積む */
  .wn-slot {
    grid-template-columns: auto 1fr;
    row-gap: calc(0.6 * var(--wn-u));
  }
  .wn-slot-preview, .wn-slot-time { grid-column: 1 / -1; }

  /* 指で押せる大きさを確保する。文字サイズの係数では 44px に届かない */
  .wn-button, .wn-choice, .wn-slot { min-height: 44px; }
}
```

- [ ] **Step 5: 縦持ちのテストが通り、横持ちが壊れていないことを確認する**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

期待: すべて PASS（Playwright 23 件）。
Task 1 の横持ち寸法回帰と Task 2 の立ち絵テストが通り続けること。

- [ ] **Step 6: 実機に近い確認をする（手動）**

```bash
NOVEL=kieta-ippen npm run dev
```

ブラウザの開発者ツールでデバイスを iPhone 14（390×844）にし、次を目視する。

- 本文が読める大きさで、1ページに5行以上入る
- タイトルのボタン3つが画面内に収まる
- 設定・セーブ・履歴のパネルが画面内に収まり、ボタンが押せる大きさである
- 場面と本文枠のあいだに黒帯が残っていない

- [ ] **Step 7: ユーザーの確認を取ってからコミットする**

```bash
git add src/engine/ui/style.css tests/e2e/read-through.spec.ts
git commit -m "feat: 縦持ちを上下分割のレイアウトにする"
```

---

### Task 4: クリック待ちでの再測定をコアに足す

`requestRepaginate()` と `view.measureFrom` を追加し、`execText` のページループを
「測る → ページを送る → 再測定要求があれば測り直す」の多重ループにする。
**DOM には一切触らない。** 向きの検知は Task 5 の UI 側。

**Files:**
- Test: `tests/core/paging.test.ts`（テストを4件追加）
- Modify: `src/engine/core/state.ts:25-40`
- Modify: `src/engine/core/runtime.ts`

**Interfaces:**
- Consumes: 既存の `setPageBreaks(breaks: number[])` / `isWaitingForPageBreaks(): boolean` /
  `enablePagination(): void`
- Produces:
  - `Runtime.requestRepaginate(): void` — UI が向きの変化で呼ぶ
  - `EngineState['view']['measureFrom']: number` — UI はこの位置以降の本文を測る
  - `setPageBreaks()` の引数の意味が「**`measureFrom` からの相対位置**」になる
    （`measureFrom` が 0 のあいだは従来と同一）
  - `view.pageBreaks` は従来どおり**本文先頭からの絶対位置**で、
    `view.page.current` でそのまま添字を引ける

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/paging.test.ts` の `describe('ページ送り', ...)` の中、末尾に足す。

```ts
  it('クリック待ちでないときの再測定要求は無視される', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    // まだ測定待ち。クリック待ちではない
    expect(r.getState().view.phase).toBe('performing')
    r.requestRepaginate()

    r.setPageBreaks([0, 4])
    await wait(r)
    expect(r.getState().view.measureFrom).toBe(0)
    expect(r.getState().view.page).toEqual({ current: 0, total: 2 })
  })

  it('ページ分割が無効なら、再測定要求はクリック待ちを解かない', async () => {
    const r = make()          // enablePagination() を呼ばない
    void r.start()
    await wait(r)
    r.requestRepaginate()
    await new Promise((done) => setTimeout(done, 20))
    // 測れる UI が無いのに待ちを解くと、本文が1つ勝手に進んでしまう
    expect(r.getState().view.currentText?.body).toBe('0123456789')
  })

  it('リプレイ中の再測定要求は無視される', async () => {
    const r = make()
    r.enablePagination()
    void r.load({ scene: 'A', index: 1, snapshot: r.getState().snapshot })
    r.requestRepaginate()
    await waitMeasure(r)
    r.setPageBreaks([0])
    await wait(r)
    expect(r.getState().view.measureFrom).toBe(0)
    expect(r.getState().view.currentText?.body).toBe('次')
  })

  it('再測定は現在ページの先頭を起点にし、ページ番号は戻らない', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([0, 4, 8])            // 3ページ
    await wait(r)
    await nextPage(r)                      // 2ページ目。文字位置 4 から
    expect(r.getState().view.page).toEqual({ current: 1, total: 3 })

    r.requestRepaginate()
    await waitMeasure(r)
    // 起点は現在ページの先頭。UI はここからの相対位置を返す
    expect(r.getState().view.measureFrom).toBe(4)
    r.setPageBreaks([0, 2, 4])             // 残り6文字が3ページに割れた

    await vi.waitFor(() => expect(r.getState().view.page.total).toBe(4))
    // 読み終えた1ページ分は残り、以降が差し替わる。添字は通し番号のまま引ける
    expect(r.getState().view.pageBreaks).toEqual([0, 4, 6, 8])
    expect(r.getState().view.page).toEqual({ current: 1, total: 4 })
    expect(r.getState().view.visibleChars).toBe(6)
  })

  it('再測定の直後は、読んでいたページを打ち直さない', async () => {
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/' })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'sequential', textSpeed: 'fast' })
    r.enablePagination()
    void r.start()
    await waitMeasure(r)
    r.setPageBreaks([0, 4])
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('typing'))
    r.advance()                            // 文字送りを打ち切ってクリック待ちへ
    await wait(r)

    const phases: string[] = []
    const off = r.subscribe(() => phases.push(r.getState().view.phase))
    r.requestRepaginate()
    await waitMeasure(r)
    r.setPageBreaks([0, 2])
    await vi.waitFor(() => expect(r.getState().view.visibleChars).toBe(2))
    off()

    // 回すたびに読んでいた段落が打ち直されるのは事故に見える
    expect(phases).not.toContain('typing')
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npm test -- tests/core/paging.test.ts
```

期待: FAIL。`r.requestRepaginate is not a function` と
`view.measureFrom` が `undefined`。

- [ ] **Step 3: `view.measureFrom` を state に足す**

`src/engine/core/state.ts`。`view` の `pageBreaks` の直前に足す。

```ts
    /** ページの測定をどこから始めるか。回転前に読み終えた分は測り直さない */
    measureFrom: number
    /** ページの先頭文字位置。[0] は常に 0。UI が測定して渡す */
    pageBreaks: number[]
```

`initialState` の `view` にも足す。

```ts
    view: {
      phase: 'performing',
      currentText: null,
      visibleChars: 0,
      measureFrom: 0,
      pageBreaks: [0],
      page: { current: 0, total: 1 },
      fadeMs: 0,
      backlog: [],
    },
```

- [ ] **Step 4: `runtime.ts` にフラグと `requestRepaginate()` を足す**

フィールドの宣言（`private paginate = false` の次の行）に足す。

```ts
  private pageBreaksResolve: ((breaks: number[]) => void) | null = null
  /** 再測定の要求。クリック待ちを解いた理由がクリックか再測定かを区別する */
  private repaginateRequested = false
```

`setPageBreaks` を差し替える。

```ts
  /**
   * UI が測った「各ページの先頭文字位置」を渡す。位置は `view.measureFrom` からの
   * 相対値で、`[0]` は常に補われる。回転前に読み終えたページは測り直さないため、
   * ここで絶対位置に直してから返す。
   * 意味を持つのは `isWaitingForPageBreaks()` が true のあいだだけで、
   * それ以外のときは無視する（本文の途中で区切りが変わると表示が破綻するため）。
   */
  setPageBreaks(breaks: number[]): void {
    const resolve = this.pageBreaksResolve
    if (!resolve) return
    this.pageBreaksResolve = null
    const from = this.state.view.measureFrom
    const normalized = breaks[0] === 0 ? breaks : [0, ...breaks]
    resolve(normalized.map((n) => n + from))
  }

  private waitForPageBreaks(): Promise<number[]> {
    // 測れる UI が無いときとリプレイ中は1ページ扱い。起点は measureFrom のまま
    if (!this.paginate || this.replaying) return Promise.resolve([this.state.view.measureFrom])
    return new Promise<number[]>((resolve) => { this.pageBreaksResolve = resolve })
  }

  /**
   * 画面の向きが変わったときに UI が呼ぶ。
   * 受け付けるのはクリック待ちの瞬間だけで、そこから現在ページの先頭を起点に測り直す。
   * 文字送りや演出の最中に区切りが変わると、表示済みの範囲と食い違って破綻する。
   *
   * 測れる UI が繋がっていないときも無視する。待ちだけ解くと本文が1つ進んでしまう。
   * リプレイ中は phase が waiting にならないので実際には届かないが、多重防御として残す。
   */
  requestRepaginate(): void {
    if (!this.paginate || this.replaying) return
    if (this.state.view.phase !== 'waiting') return
    const resolve = this.clickResolve
    if (!resolve) return
    this.repaginateRequested = true
    this.clickResolve = null
    resolve()
  }
```

- [ ] **Step 5: `execText` のページループを多重化する**

`execText` を丸ごと差し替える。

```ts
  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    const gen = this.generation

    // セーブ操作とは無関係に、本文を表示した瞬間に記録する
    this.read.add(step.h)
    // バックログはシーン境界でクリアしない（enterScene に手を入れないこと）。
    // entries() は毎回新しい配列なので、購読側から見て参照が変わる
    this.backlog.push({ speaker: step.speaker, body: step.body })
    this.state.view.backlog = this.backlog.entries()
    this.state.progress.index = step.i
    this.state.view.currentText = { speaker: step.speaker, body: step.body }
    this.state.view.visibleChars = 0
    this.state.view.measureFrom = 0
    this.state.view.pageBreaks = [0]
    this.state.view.page = { current: 0, total: 1 }
    this.state.view.phase = 'performing'
    this.repaginateRequested = false
    this.emit()

    /** 読み終えたページの先頭位置。再測定でも失われないので、ページ番号は通し番号になる */
    let head: number[] = []
    /** 再測定の直後か。読んでいたページを打ち直さないために使う */
    let resumed = false

    for (;;) {
      // UI がこの本文を測り終えるまで待つ。ページ分割が無効なら即座に返る
      const breaks = await this.waitForPageBreaks()
      // ロードで打ち切られていたら、ページを1つも進めずに降りる
      if (gen !== this.generation) return
      this.state.view.pageBreaks = [...head, ...breaks]

      let p = 0
      for (; p < breaks.length; p++) {
        if (gen !== this.generation) return
        const end = p + 1 < breaks.length ? breaks[p + 1] : step.body.length
        this.state.view.page = { current: head.length + p, total: head.length + breaks.length }
        this.emit()
        await this.type(step.body, breaks[p], end, resumed && p === 0)
        // ページ送り待ちもセーブ可能点。画面が静止して次のクリックを待つ点は最終ページと同じ
        await this.waitForClick()
        if (gen !== this.generation) return
        if (this.repaginateRequested) break
      }
      if (!this.repaginateRequested) return

      // 読んでいたページの先頭から測り直す。起点を固定するのでページ番号はずれない
      this.repaginateRequested = false
      head = [...head, ...breaks.slice(0, p)]
      this.state.view.measureFrom = breaks[p]
      resumed = true
      this.emit()
    }
  }
```

- [ ] **Step 6: `type()` に `instant` を足す**

`type()` のシグネチャと先頭の分岐だけを差し替える（残りはそのまま）。

```ts
  /**
   * ページの範囲 [from, to) を1文字ずつ visibleChars で開く。
   * リプレイ中と一括表示のときは即座に全文表示になる。
   * `instant` は再測定の直後に立つ。読んでいたページを打ち直さないため。
   */
  private async type(body: string, from: number, to: number, instant = false): Promise<void> {
    const delay = charDelayMs(this.settings, this.state.snapshot.speed)
    if (this.replaying || delay === 0 || instant) {
      this.state.view.visibleChars = to
      this.emit()
      return
    }
```

- [ ] **Step 7: テストが通ることを確認する**

```bash
npm test -- tests/core/paging.test.ts
```

期待: PASS（12 件）。続けて全体。

```bash
npm run typecheck && npm run lint && npm test
```

期待: すべて PASS（Vitest 124 件）。

- [ ] **Step 8: リプレイ専用の分岐が5箇所のままであることを確認する**

```bash
grep -n 'this.replaying' src/engine/core/runtime.ts
```

期待: `waitForClick` / `perform` / `type` の判定、`bgm` と `se` の判定、
`exec` 先頭の終了判定に加えて、`waitForPageBreaks` と `requestRepaginate` の
2箇所が増える。**どちらも step の処理ではなく待ちの入口の判定**であり、
`docs/status.md` の「リプレイ専用の分岐は5箇所」の数え方（step の処理に入っていない）は
維持されている。Task 6 の決定記録にこの数え直しを記録する。

- [ ] **Step 9: ユーザーの確認を取ってからコミットする**

```bash
git add src/engine/core/state.ts src/engine/core/runtime.ts tests/core/paging.test.ts
git commit -m "feat: クリック待ちでのページ再測定をコアに実装する"
```

---

### Task 5: 向きの変化で再測定を走らせる

UI が `matchMedia('(orientation: portrait)')` の変化を購読して `requestRepaginate()` を呼び、
`MessageBox` が `view.measureFrom` 以降だけを測る。

**Files:**
- Test: `tests/e2e/read-through.spec.ts`（テストを1件追加）
- Modify: `src/engine/ui/MessageBox.tsx:21-27`
- Modify: `src/engine/ui/App.tsx:65-71`

**Interfaces:**
- Consumes: Task 4 の `requestRepaginate()` / `view.measureFrom`、
  `computePageBreaks(host, text, maxHeight): number[]`（相対位置を返す。変更しない）
- Produces: なし（最終形）

- [ ] **Step 1: 回転のテストを書く**

`tests/e2e/read-through.spec.ts` の末尾に足す。

```ts
/**
 * 回転で枠の形が変わると、収まっていた文字が overflow で隠れて読めなくなる。
 * クリック待ちの瞬間に、読んでいたページの先頭から割り直す。
 */
test('本文の途中で画面を回すと、読んでいた位置からページを割り直す', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  // 台本を書き換えずにページ送りを踏むため、文字を大きくして枠に収まらなくする
  await page.addStyleTag({ content: '.wn-messagebox { font-size: 14cqw !important; }' })
  await page.getByRole('button', { name: 'はじめから' }).click()
  await page.waitForSelector('.wn-messagebox')
  await settle(page)

  const indicator = page.locator('.wn-page')
  // 縦持ちで複数ページに割れていること（割れていなければ font-size を上げる）
  await expect(indicator).toHaveText(/1 \/ [2-9]/)

  await tap(page)
  await settle(page)
  await expect(indicator).toHaveText(/2 \/ \d+/)
  const before = (await body(page).textContent())!

  // 横持ちに回す
  await page.setViewportSize({ width: 844, height: 390 })
  await settle(page)

  // ページ番号は戻らない（通し番号のまま）
  await expect(indicator).toHaveText(/2 \/ \d+/)
  // 読んでいた位置が新しいページの先頭に来る。どちらかがもう一方の先頭一致になる
  const after = (await body(page).textContent())!
  expect(after.startsWith(before) || before.startsWith(after)).toBe(true)

  // 割り直しても本文は落ちない。最後まで送ると全文が揃う
  const rest: string[] = [after]
  for (;;) {
    const [current, total] = (await indicator.textContent())!.split('/').map(Number)
    if (current === total) break
    await tap(page)
    await expect(indicator).toHaveText(`${current + 1} / ${total}`)
    await settle(page)
    rest.push((await body(page).textContent())!)
  }
  expect(FIRST_BODY.endsWith(rest.join(''))).toBe(true)
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```bash
npm run test:e2e -- -g '画面を回す'
```

期待: FAIL。回転後もページ番号と本文が変わらない（再測定が走らない）。

- [ ] **Step 3: `MessageBox` が `measureFrom` 以降を測るようにする**

`src/engine/ui/MessageBox.tsx` の `useLayoutEffect` を差し替える。

```tsx
  /**
   * コアは本文を出したあと測定待ちで止まる。描画直後に測って境界を返す。
   *
   * 依存配列を置かず、毎レンダで「待っているか」を見る。本文をキーにすると、
   * 同じ本文が2回続いたときや、同じブロックへロードし直したときに
   * 効果が再実行されず、コアが測定待ちのまま止まる。
   *
   * 測るのは measureFrom 以降だけ。回転しても読み終えたページは測り直さない
   * （返す位置も measureFrom からの相対値。絶対位置に直すのはコアの責務）。
   */
  useLayoutEffect(() => {
    if (!runtime.isWaitingForPageBreaks()) return
    const host = measureRef.current
    const box = bodyRef.current
    if (!host || !box || !text) return
    const rest = text.body.slice(state.view.measureFrom)
    runtime.setPageBreaks(computePageBreaks(host, rest, box.clientHeight))
  })
```

- [ ] **Step 4: `App` が向きの変化を購読するようにする**

`src/engine/ui/App.tsx` の `visibilitychange` の `useEffect` の直後に足す。

```tsx
  /**
   * 画面の回転でメッセージ枠の形が変わると、収まっていた文字が隠れて読めなくなる。
   * コアが安全な瞬間（クリック待ち）だけ受け付けるので、ここは要求を投げるだけでよい。
   *
   * resize は使わない。モバイルは URL バーの伸縮で頻発するため、向きの変化だけを見る。
   */
  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const onChange = () => runtime.requestRepaginate()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [runtime])
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

期待: すべて PASS（Vitest 124 件 / Playwright 24 件）。

Step 2 のテストが「縦持ちで1ページのまま」で落ちる場合は、
`addStyleTag` の `font-size` を `20cqw` まで上げてから再実行する。

- [ ] **Step 6: 実機に近い確認をする（手動）**

```bash
NOVEL=kieta-ippen npm run dev
```

開発者ツールのデバイスモードで iPhone 14 にし、本文を読み進めながら
回転ボタンで縦横を切り替える。次を目視する。

- 読んでいた文が回転後も画面の先頭にある
- ページ番号（`n / m`）が戻らない
- 回転直後に本文が打ち直されない
- 文字送りの最中に回しても表示が壊れない（次のクリック待ちまで反映されない）

- [ ] **Step 7: ユーザーの確認を取ってからコミットする**

```bash
git add src/engine/ui/MessageBox.tsx src/engine/ui/App.tsx tests/e2e/read-through.spec.ts
git commit -m "feat: 画面の回転でページを割り直す"
```

---

### Task 6: ドキュメントを更新する

**Files:**
- Create: `docs/decisions/2026-08-09-portrait-layout.md`
- Modify: `docs/architecture.md:254-262`
- Modify: `docs/engine-spec.md:438`
- Modify: `docs/status.md`
- Modify: `README.md:36,42`

**Interfaces:**
- Consumes: Task 1-5 の実装
- Produces: なし

`docs/decisions/2026-08-09-implementation-decisions.md` と
`docs/superpowers/specs/2026-08-09-portrait-layout-design.md` は
**凍結文書なので書き換えない。** `docs/implementation-plan.md` も触らない
（あれは初期実装18タスクのログ）。

- [ ] **Step 1: 決定記録を新規に足す**

`docs/decisions/2026-08-09-portrait-layout.md` を作る。

```markdown
# 縦持ちレイアウトと、回転時の再測定

- 決定日: 2026-08-09
- 対象: `src/engine/ui/style.css`、`src/engine/core/runtime.ts`、`src/engine/core/state.ts`

> これは決定時点のスナップショットである。現在の確定仕様は
> `docs/engine-spec.md` と `docs/architecture.md` にある。

## 決めたこと

1. **縦持ちは 16:9 のレターボックスをやめ、上下 50:50 に分割する。**
   上が場面（背景＋立ち絵）、下が本文枠。背景は `cover` のままなので左右が最大 49% 切れる。
   「上下比を固定する」と「切れる量を固定する」は両立しないため、前者を採った。
2. **寸法の倍率を `--wn-u` の1変数にまとめ、縦持ちは 1.7 倍にする。**
   既存の係数はすべて残るので横持ちの見た目は不変。
   1.7 は「同じ端末を横持ちにしたときの文字サイズに揃う」値。
3. **画面の回転では、クリック待ちの瞬間だけページを割り直す。**

## 2026-08-09 の決定3を覆した

[実装フェーズで決めたこと](2026-08-09-implementation-decisions.md)の決定3は
「画面サイズの変更は次の本文ブロックから反映する（resize での再測定は行わない）」だった。
これは「読者がブロックの途中で画面を回す頻度」を低く見積もった判断である。

デスクトップのウィンドウリサイズは稀だが、**縦持ちを正式に支えるなら回転は日常的に起きる。**
再測定しなければ、縦→横で枠が狭くなったときに収まっていた文字が `overflow: hidden` で隠れ、
読者はその分を読めないまま次のブロックへ進む。

決定3が挙げていた破綻は、条件を絞ることで消えた。

| 決定3 の懸念 | 今回の対処 |
|---|---|
| `type()` が走り終えた範囲と表示する範囲が食い違う | 再測定は `phase === 'waiting'` のときだけ。文字送りは走っていない |
| ページ番号が指す位置がずれる | 起点を現在ページの先頭 `measureFrom` に固定する。読者がいま読んでいる位置が必ず新しい1ページ目の先頭に来る |
| ページ番号が戻る | 読み終えたページの先頭位置を `head` に残し、通し番号を保つ。縦持ちの「1 / 2」で回すと「1 / 3」になる。数字は単調に増える |

**古い決定記録は書き換えていない。** それが記録としての価値だから。

## 採らなかったもの

| 案 | 理由 |
|---|---|
| 自動で横向きに固定する | `screen.orientation.lock()` は iOS Safari 未対応。Manifest の `orientation` は PWA の standalone 表示だけ。`transform: rotate()` は「一括拡縮を採らない」方針に抵触する |
| 立ち絵を本文枠に重ねる | 上下 50:50 なら立ち絵は 371px（横持ちの 343px より大きい）になり、重ねる動機が消える |
| 背景を `contain` で敷き、上下をぼかしで埋める | 鮮明に見える範囲が 26% のままで、目的を果たさない |
| 縦持ち専用の背景素材 | 作品側に「縦用の絵を描く」義務が増える。必要になってから入れる |
| `resize` を購読する | モバイルは URL バーの伸縮で頻発する。向きの変化だけを見る |
| 焦点の自動判定（顔検出・サリエンシー） | 常に中央で切る |

## 設計ドキュメントからの逸脱

[縦持ちレイアウト設計](../superpowers/specs/2026-08-09-portrait-layout-design.md)の
検証表にある「縦長ビューポートで**場面が 16:9**であること」は誤りだった。
同ドキュメントの決定2の表のとおり、iPhone 14 の場面枠は 390×422（比 0.92）であり
16:9 にならない。16:9 なのは横持ちのステージと背景素材そのものだけである。
E2E は「ステージがビューポート全体、場面の高さがステージの 50%」を検証している。

再測定の直後は、読んでいたページを文字送りで打ち直さず即座に全文を表示する
（`type()` の `instant`）。設計ドキュメントには書かれていないが、
回すたびに読んでいた段落が打ち直されるのは演出ではなく事故に見えるため。

## リプレイ専用の分岐の数え方

`this.replaying` の判定は `waitForPageBreaks()` と `requestRepaginate()` の
2箇所で増えたが、**どちらも待ちの入口の判定であって step の処理ではない。**
「step の処理そのものにリプレイ専用の分岐は1つも入っていない」という不変条件は保たれている。

## 残る制約

- 背景の左右が最大 49% 切れる。作品側が「中央に重要なものを置く」配慮をすれば
  緩和されるが、エンジンは強制しない
- URL バーの伸縮では再測定しない。向きの変化だけを見るため、
  バーの出入りで枠の高さが変わっても次のブロックまで反映されない
- 縦持ち専用の背景素材には対応しない
- iOS Safari の実機では未確認（開発者ツールのデバイスモードまで）
```

- [ ] **Step 2: `docs/architecture.md` の「画面のスケーリング」を書き換える**

254-262 行の節を差し替える。

```markdown
## 画面のスケーリング

**横持ち**は基準解像度 **1280×720（16:9）** のステージをビューポートにフィットさせ、
レターボックスする。**縦持ち**（`orientation: portrait`）はレターボックスをやめ、
ステージをビューポート全体に広げて上下に分割する。

| | 横持ち | 縦持ち |
|---|---|---|
| `.wn-stage` | 16:9・レターボックス | `100vw × 100dvh` |
| `.wn-scene`（場面） | `inset: 0`（ステージと同寸） | 高さ `50cqh`（画面の上半分） |
| `.wn-msg-area`（本文枠の領域） | ステージ全面に敷くだけ | 場面の下の残り全部 |

内部の寸法は `container-type: size` ＋ **`--wn-u` の係数**で表現する。

```css
.wn-stage { --wn-u: 1cqw; }
@media (orientation: portrait) { .wn-stage { --wn-u: 1.7cqw; } }
.wn-messagebox { font-size: calc(2.6 * var(--wn-u)); }
```

係数（2.6 / 2.2 / 1.9 …）は縦横で共有し、倍率だけを差し替える。
**縦持ちの 1.7 は「同じ端末を横持ちにしたときの文字サイズに揃う」値。**

`.wn-scene` は自身も `container-type: size` を持つ。立ち絵の `88cqh` を
ステージではなく**場面**基準にするため。**場面の内側で `--wn-u` を使ってはいけない**
（コンテナが場面になり、倍率の基準がずれる）。

`transform: scale()` による一括拡縮は採らない。テキストがスケール後のラスタライズになり、
大画面で眠くなるため。

背景は縦持ちでも 16:9 素材を `cover` / `center` で敷く。**左右は最大 49% 切れる。**
縦持ち専用の素材には対応しない。
```

- [ ] **Step 3: `docs/engine-spec.md` の未確定事項から外す**

438 行の `- モバイルの縦持ち時の画面` を削除する。
同じ節の直後に、縦持ちの仕様を1行足す。

```markdown
## 未確定事項

- 素材のプリロードとメモリ管理
- スキップUI
- 変数の宣言記法（分岐を導入するときに決める）
- エンジン名（README 目標2）
```

`docs/engine-spec.md:54` の「本文ブロック連番 `i` にも影響しない。」の直後
（「**文字送りの設定は2階建て。**」の前）に段落を足す。

```markdown
画面の向きが変わったときは、**クリック待ちの瞬間だけ**ページを割り直す。
起点は現在ページの先頭なので、読んでいた位置は必ず新しいページの先頭に来る。
ページ番号は通し番号を保ち、戻らない（縦持ちの「1 / 2」で回すと「1 / 3」になる）。
文字送りや演出の最中は反映されず、次のクリック待ちまで待つ。
```

- [ ] **Step 4: `README.md` を更新する**

36 行目の「16:9 のレターボックス」を差し替える。

```markdown
話者によるネームプレートの出し分け、横持ちの 16:9 レターボックスと縦持ちの上下分割、
```

42 行目の残事項から「モバイルの縦持ち」を外す。

```markdown
素材のプリロード、スキップUI、分岐と変数、作品選択画面、
```

- [ ] **Step 5: `docs/status.md` を更新する**

- 「現在地」に縦持ちの節を足す（上下 50:50、`--wn-u` の 1.7 倍、回転時の再測定）
- 「次のセッションで最初にやること」を、縦持ちの実装完了と
  **残事項の表から次を選ぶ**という記述に差し替える
- 「残事項 > その後」の表から「モバイルの縦持ち時の画面」の行を削除する
- 「検証の状態」の件数を実測に合わせる（Vitest 124 件 / Playwright 24 件。
  実際の数字は `npm test` と `npm run test:e2e` の出力で確認する）
- 「忘れやすい前提」に1項目足す

```markdown
12. **画面の回転はクリック待ちの瞬間だけ反映される。** 起点は現在ページの先頭で、
    ページ番号は通し番号を保つ。`resize` は購読しない（URL バーの伸縮で頻発するため）。
    これは [2026-08-09 の決定](decisions/2026-08-09-implementation-decisions.md) の決定3を
    [縦持ちの決定](decisions/2026-08-09-portrait-layout.md) で覆したもの。
```

- 「完了したこと」の決定記録の表に1行足す

```markdown
| [縦持ちレイアウトと回転時の再測定](decisions/2026-08-09-portrait-layout.md) | 上下 50:50、`--wn-u` の倍率、決定3を覆した経緯 |
```

- [ ] **Step 6: 検証コマンドを走らせ、ドキュメントの数字を実測に合わせる**

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

出力のテスト件数を `docs/status.md` の「検証の状態」に反映する。

- [ ] **Step 7: ユーザーの確認を取ってからコミットする**

```bash
git add docs README.md
git commit -m "docs: 縦持ちレイアウトの決定と仕様をドキュメントに反映する"
```

---

## 完了の定義

- [ ] `npm run typecheck` / `npm run lint` / `npm test` / `npm run test:e2e` がすべて green
- [ ] 横持ち（1280×720）の見た目が実装前と1ピクセルも変わっていない（Task 1 の回帰テスト）
- [ ] iPhone 14 相当（390×844）で上下 50:50、本文が 17px 前後、立ち絵が 371px
- [ ] 本文の途中で回転しても、読んでいた位置が保たれ、ページ番号が戻らない
- [ ] `src/engine/core/**` に DOM の import が無い（ESLint が担保）
- [ ] `docs/decisions/2026-08-09-implementation-decisions.md` と
      `docs/superpowers/specs/2026-08-09-portrait-layout-design.md` が書き換えられていない

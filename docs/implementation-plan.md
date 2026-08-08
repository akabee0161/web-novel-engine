# 実装計画

> **エージェント実行者へ:** この計画は superpowers:subagent-driven-development または
> superpowers:executing-plans でタスク単位に実装する。ステップは `- [ ]` で進捗を追う。

- 状態: **実装着手前**。タスク完了に応じてチェックを埋める
- 前提: [エンジン仕様](engine-spec.md) / [実装構成](architecture.md) / [スクリプト構文](script-syntax.md)
- ゴール: `drafts/sample-short.wn` が `novels/kieta-ippen/` として最後まで通しで読める状態にする

**アーキテクチャ:** 台本を Vite プラグインでビルド時に JSON へコンパイルし、React 非依存のコア
（`src/engine/core/`）がそれを実行する。React（`src/engine/ui/`）は `useSyncExternalStore` で
コアを購読して描くだけ。演出の時間はコアが持ち、CSS には数値として渡す。

**技術スタック:** Vite / React / TypeScript / Vitest / Web Audio API / localStorage

## 進め方

**縦に切る。** フェーズ1〜3で「本文が画面に出てクリックで進む」ところまで作り、
以降は**命令を1つずつパーサ・コア・UI に通しで足す**。層ごとにまとめて作らない。
台本に出てきたものだけ実装するという README 目標1が、そのままタスクの並びになる。

```
[完了] フェーズ1  土台と最小パーサ          Task 1-4
[完了] フェーズ2  コアの骨格                Task 5-6
[完了] フェーズ3  最小UI（ここで動く）      Task 7-8
[完了] フェーズ4  命令を1つずつ           Task 9-12
[完了] フェーズ5  既読・バックログ・セーブ  Task 13-16
[  ] フェーズ6  ページ送りと仕上げ        Task 17-18
```

## グローバル制約

以下は全タスクの要件に暗黙に含まれる。

| 制約 | 内容 |
|---|---|
| Node | 22 以上（`import.meta.dirname` を使う） |
| コアの独立性 | `src/engine/core/**` は React も DOM も import しない。ESLint で機械的に落とす |
| 状態の集約 | エンジンの状態は `EngineState` の1箇所だけ。`useState` にエンジン状態を置かない |
| 3層 | 新しい状態は `snapshot` / `progress` / `view` のどれに置くか必ず選ぶ |
| 演出時間 | 待ち時間はコアが持つ。`transitionend` で完了を判定しない |
| 作品ID | `boot()` に明示的に渡す。ディレクトリ名から拾わない |
| 台本の第一原則 | 記法を1つも含まないプレーンテキストは必ずパースが通る |
| コミット | Conventional Commits（`feat:` / `fix:` / `test:` / `chore:` / `docs:`） |
| 言語 | エラーメッセージ・コメントは日本語 |

---

## 計画からの逸脱の記録

実装中に計画の記述どおりにいかなかった点。**次に読む人はこちらが正しい。**

| # | 計画の記述 | 実際 | 理由 |
|---|---|---|---|
| 1 | Task 1 の依存に `@types/node` がない | 追加し、`tsconfig` の `types` に `"node"` を足した | `tools/` が `node:fs` / `node:crypto` を使う。無いと `vite.config.ts` から型が通らない |
| 2 | `tsconfig` に `baseUrl: "."` | 削除した | TypeScript 6 で非推奨（TS5101）。`paths` は tsconfig 相対で解決されるため不要 |
| 3 | `tsconfig` に `allowImportingTsExtensions` がない | 追加した | テストが `../../tools/wn-compile/parse.ts` と拡張子付きで import するため（TS5097） |
| 4 | `eslint.config.js` に `.mjs` の globals 指定がない | `**/*.mjs` に Node のグローバルを宣言した | `gen-dummy-assets.mjs` が `no-undef` で落ちる。TS ファイルは typescript-eslint が `no-undef` を切るので影響を受けていなかった |
| 5 | `boot()` は Task 7 まで存在せず、Task 4 の時点で型エラーになる | Task 4 で `src/engine/index.ts` にスタブ（呼ぶと throw）を置いた | 各コミットで `typecheck` を緑に保つため。中身は Task 7 で入れる |
| 6 | `sample.test.ts` のテスト名が「7シーンになる」 | 「6シーンになる」に直した | 計画本文の数字と、同じテスト内の期待値配列（6要素）が食い違っていた。台本は6シーン |
| 7 | Task 7 / 8 の「実機で確認する」が手動前提 | Playwright で自動化し、`tests/e2e/` に残した | 確認項目がすべて DOM から取れる。フェーズ4 の主題（背景・立ち絵・音声）は DOM でしか検証できない |
| 8 | 素材ディレクトリは `<作品ディレクトリ>/public` に固定 | `novel.config.json` で差し替え可能にした（既定は同じ） | 実素材をリポジトリの外に置けるようにするため。[2026-08-08 の決定](decisions/2026-08-08-asset-location-and-verification.md) |
| 9 | `.wn-stage` に属性なし | `data-phase` を出すようにした | E2E が文字送りの途中を掴んで不安定になる。CSS の演出フックとしても要る |
| 10 | Task 9 Step 8「実機で確認する」が手動前提 | Playwright に2件足した（背景の切替順・フェード中のクリック） | 逸脱7 と同じ。あわせて背景レイヤに `data-bg` を出した（E2E から背景名を取るため。逸脱9 の `data-phase` と同じ扱い） |
| 11 | Task 10 Step 7「実機で確認する」が手動前提 | Playwright に1件足した（立ち絵の出入りと位置）。立ち絵に `data-sprite` / `data-expr` を出した | 逸脱10 と同じ |
| 12 | — | 既存 E2E「文字送りは1文字ずつ進み…」の計測を 5回×90ms → 3回×60ms に縮め、tap 直前に `phase === 'typing'` を明示した | E2E が8本になって並列負荷が上がり、計測ループが文字送りの予算（21文字×40ms=840ms）を超えて 3回中2回落ちた。掴む本文がずれるだけで実装の不具合ではない |
| 13 | Task 11 Step 1 のテストに申し送りの分がない | 「演出中のクリック」3件を足した（打ち切り・本文を飛ばさない・連打で1つずつ）。Step 3 にない `performCancel` と `advance()` の `performing` 分岐も実装した | Step 1/3 のコードだけでは申し送り（`perform()` を中断可能にする）が実装されないため |
| 14 | Task 11 Step 1 の2件が空振りで通る | 待ち合わせを `phase === 'performing'` から `view.fadeMs` に変えた | `initialState` の `phase` が `performing` なので、待ちに入る前でも条件が成立してしまう |
| 15 | Task 9 で足した E2E「フェード中はクリックしても進まない」 | 「演出中のクリックは待ちを打ち切るだけで、本文は飛ばさない」に書き換えた | Task 11 で仕様が変わった。打ち切りの時間的な検証は core のテストが持つ |
| 16 | Task 11 Step 7「実機で確認する」が手動前提 | Playwright に1件足した（`@flashback` の区間） | 逸脱10 と同じ。`@speed` / `@wait` は時間の検証なので core 側に置いた |
| 17 | Task 12 Step 8「実機で確認する」が手動前提 | Playwright に1件足した。`AudioContext` の生成回数と `decodeAudioData` の回数を計測し、通し読みで警告が出ないことを見る | 逸脱10 と同じ。**鳴っているかどうかは検証できない**ので、解禁の起点（タイトル画面のクリック）と素材のデコード成功までを固定した。iOS Safari での実聴は未実施 |
| 18 | Task 12 Step 3/4 の `exec` に `default` 節あり | `default` を削除した | 10命令すべてが揃い、`switch` が網羅的になったため |
| 19 | Task 13 Step 8「実機で確認する」が手動前提 | Playwright に1件足した（読み進めた分が `wn:kieta-ippen:system` に入り、リロードしても残る） | 逸脱10 と同じ。書き出しの契機は `pagehide` を使うため、`page.reload()` がそのまま検証になる |
| 20 | Task 13 Step 1 のテストに設定の永続化がない | 「設定の永続化」2件を足した（`setSettings` が次回起動に残る・設定の書き出しで既読が消えない） | Step 5 の `setSettings` は `read.toArray()` を書いており、ここを `[]` にしても Step 1 のテストは全部通ってしまう |
| 21 | Task 14 Step 1 のテストに申し送りの assert がない | 「本文を1つ表示すると `view.backlog` の参照が変わる」を足した | 申し送りが要求しているのは `view.backlog` の参照であって、`Backlog.entries()` の参照ではない。Step 1 の3件目だけではコアの組み込みを検証できない |
| 22 | Task 14 Step 6 の `Backlog.tsx` がネームプレートの規則を自前で持つ | `ui/speaker.ts` に `displayName()` を切り出し、`MessageBox.tsx` と共用した | 「話者なしの「」は主人公」は script-syntax の規則。2箇所に写すと、片方だけ直したとき同じ行の名前が画面によって変わる |
| 23 | Task 14 Step 9「実機で確認する」が手動前提 | Playwright に1件足した（演出中はボタンが出ない・シーンをまたいで遡れる・閉じても進行位置が動かない） | 逸脱10 と同じ |
| 24 | Task 15 Step 1 の `step()` ヘルパが `advance()` のあと「waiting になるまで」待つ | 「本文が変わるまで」待つように変えた | `advance()` は待ちを解くだけで `phase` をその場では変えない。元の書き方だと1度も進まずに通り、6件が空振りで落ちていた |
| 25 | Task 15 Step 4 の `load()` に、走っている再生ループを止める処理がない | `generation` と `abortRun()` を足し、`runFrom` の各 step 後に世代を確認するようにした | 再生中にロードすると `runFrom` が二重に走り、古いループがクリックのたびに元の位置へ状態を引き戻す。「再生中のロード」のテストを1件足した |
| 26 | Task 15 Step 8 の「つづきから」が本編へ切り替えてからロードメニューを開く | タイトル画面のままメニューを開き、スロットを選んだ時点で切り替えるようにした | 先に切り替えると、スロットを選ばずに閉じたとき何も表示されていない画面に取り残される。ロードが失敗したときも同じ理由でタイトルに戻す |
| 27 | Task 15 Step 9「実機で確認する」が手動前提 | Playwright に3件足した（セーブ→リロード→つづきからの再現・オートセーブ・存在しないシーンの明示） | 逸脱10 と同じ。「リプレイ中に SE が連打されない」は時間と発火回数の検証なので core 側に置いた |
| 28 | Task 16 Step 4「実機で確認する」が手動前提 | Playwright に1件足した（一括表示で `@speed` の区間でも `typing` が1度も出ない・速さの選択が無効になる・リロードをまたぐ） | 逸脱10 と同じ。音量が BGM に届いているかは DOM から取れないので入れていない |
| 29 | — | **一括表示のあいだ `data-phase` は `waiting` のまま変わらない**（文字送りの区間が無く、`type()` が phase を触らずに返るため）。E2E の待ち合わせは本文の変化で行う | 逐次表示を前提にした `phase` の遷移待ちが、一括表示では即座に成立して空振りする。既存の E2E ヘルパ `settle` / `readAll` も逐次表示専用 |
| 30 | Task 17 Step 5 の `computePageBreaks` が Range の矩形高さと要素の `clientHeight` を比べる | 行数で比べるようにした（`range.getClientRects().length <= floor(maxHeight / line-height)`） | Range の矩形は**グリフの範囲であって行送りを含まない**。最終行の行送りぶんだけ判定が甘くなり、枠から1行はみ出す。実測で 2行=224px が「192px に収まる」と判定されていた |
| 31 | Task 17 Step 6 の測定効果が `text?.body` をキーにする | 依存配列を置かず、毎レンダで `isWaitingForPageBreaks()` を見るようにした | 同じ本文が2回続いたときや、同じブロックへロードし直したときに効果が再実行されず、コアが測定待ちのまま**永久に止まる** |
| 32 | Task 17 Step 6 の `enablePagination()` が `MessageBox` の効果の中 | `boot.tsx` に移した | 効果は初回レンダの**後**に走るので、最初の1ブロックだけ測定前に1ページ扱いで流れてしまう |
| 33 | Task 17 Step 6 の resize での再測定 | 入れていない。`setPageBreaks` は測定待ちのときだけ効く | 本文の途中で区切りが変わると、`type()` が走り終えた範囲と表示範囲が食い違って表示が壊れる。画面サイズの変更は**次の本文ブロックから**反映される |
| 34 | Task 17 Step 8「実機で確認する」が台本に長い行を一時的に足す前提 | Playwright で `.wn-messagebox` の `font-size` を上書きし、既存の本文を溢れさせた。ページの連結が元の本文と一致することまで見る | 台本は作品そのものなので、確認のために書き換えたくない。逸脱10 と同じく E2E に残す |
| 35 | Task 17 Step 1 の `advance()` 後の待ち合わせ | ページ番号が変わるまで待つ `nextPage()` にした | 逸脱24 と同じ理由。既存の `typing.test.ts` も測定待ちの await が1つ増えたことで不安定になったため、購読で全 emit を拾う形に書き換えた |
| 36 | — | E2E の本文ロケータ `.wn-messagebox > div:last-child` を `.wn-body` に変えた | 測定用の `.wn-measure` が最後の子になり、**常に全文**を持つため掴む対象が入れ替わっていた |

**フェーズ3 完了後に確定した仕様**（Task 10 / 11 / 14 に申し送り済み）:
演出中のクリックは現在の待ちだけ打ち切る（**Task 11 で実装済み**）／
`view` と `snapshot` の配列は置き換える（`sprites` は **Task 10 で実装済み**、`backlog` は Task 14）。

**採用したツールのバージョン**（計画が書かれた時点より新しい）:
Vite 8 / TypeScript 6 / ESLint 10 / Vitest 4 / React 19。

---

## 着手前に確定させる仕様（確定済み）

計画を書く過程で、engine-spec / architecture に定義がない点が10個見つかった。
**2026-08-08 にすべて確定し、`engine-spec.md` / `architecture.md` / `status.md` に反映済み。**
経緯は[実装着手前に確定させた10項目](decisions/2026-08-08-pre-implementation-decisions.md)。

以下は本計画が前提とする確定仕様であり、実装はこれに従う。

### 1. 命令数は10個（ドキュメントの誤記）

`status.md` と decisions は「命令は14個」と書いているが、列挙されているのは
`@title @protagonist @bg @bgm @se @show @hide @wait @speed @flashback` の**10個**。
`@bgm stop` / `@hide *` / `@speed slow|normal` / `@flashback on|off` を
別命令として数えた結果と思われる。**行頭の命令名は10種類**が正しい。

→ `status.md` を修正する。decisions は凍結なので触らない。

### 2. 素材パスの解決は assets テーブルに統一する

architecture.md は「見つかったパスを step の `src` に埋める」と書いているが、
**立ち絵ではこれが成立しない。** `@show mika smile` は表情を省略できる仕様
（`@show mika pos:left` は表情を維持）であり、その時点の表情はビルド時に確定しない。
静的に追跡することはできるが、分岐が入ると到達経路が一意でなくなる
（engine-spec がスナップショットの静的計算を却下したのと同じ理由）。

**コンパイラは `public/` をスキャンして論理名 → 実パスの表を1つ出し、実行時に引く。**

```json
"assets": {
  "bg/clubroom_day":   "bg/clubroom_day.svg",
  "chara/mika_normal": "chara/mika_normal.svg",
  "bgm/daily":         "bgm/daily.wav"
}
```

存在チェック（ビルドエラー）は台本の引数に対して行う。表情を省略した `@show` は
チェックできないため、実行時に表が引けなければ `console.warn` して立ち絵を出さない。

→ architecture.md の「素材の解決」を書き換える。

**これはプリロード用マニフェストではない。** decisions が「出力しない」と決めたのは
シーンごとの使用素材一覧であり、パス解決表とは別物。プリロードは残事項のまま。

### 3. 既読ハッシュの「話者名」の定義

`シーン名 \n 話者名 \n 本文` の話者名は、**台本の `>` の引数そのもの**。
`>` がない行（地の文・主人公の発話）と `>` 引数なし（伏せる）は**空文字列**。

`@protagonist` の名前を混ぜない。混ぜると主人公名を変えた瞬間に
主人公の発話が全部未読に戻る。

### 4. オートセーブのタイミング

engine-spec はキー `wn:<作品ID>:save:auto` を定義しているが、いつ打つかを書いていない。

**セーブ可能点に到達するたびに打つ**（`phase` が `waiting` になった瞬間）。
セーブ可能点の定義がそのままオートセーブのタイミングになり、
「フェード中にオートセーブを打たない」という制約が構造的に満たされる。

### 5. 文字送り中のクリックの挙動

**全文を即座に表示して `waiting` に移る。** engine-spec は
「文字送り中にセーブが要求されたら文字送りを完了させてからセーブする」と
書いており、この挙動を前提にしている。

### 6. 文字送りの実値

| 項目 | 値 |
|---|---|
| 基準 | 40ms / 文字 |
| 読者設定（速度） | 遅い ×1.5 ／ 普通 ×1.0 ／ 速い ×0.5 |
| 読者設定（モード） | 逐次表示 ／ 一括表示 |
| `@speed slow` | さらに ×2.0 |
| `@speed normal` | ×1.0 |

一括表示のときは `@speed` を完全に無視する（engine-spec の規定）。

### 7. ページ分割の測定は UI が行い、境界を数値でコアに渡す

コアは DOM を触れないため、テキスト測定は UI 層の責務。
UI が Range API で「枠に収まる文字数」を測り、
`runtime.setPageBreaks(breaks: number[])` で境界の配列をコアに渡す。
コアは現在ページの文字範囲だけを文字送りの対象にする。

コアは数値しか受け取らないため React/DOM 非依存は保たれ、
テストでは境界を直接渡せる。

### 8. テストは `tests/` に置く

architecture.md のディレクトリ構成図にテストの置き場所がない。
`tests/` にソースをミラーする構成を採る（`tests/compile/parse.test.ts` など）。
`vite.config.ts` が環境変数 `NOVEL` を要求するため、テストは `vitest.config.ts` を分ける。

### 9. リプレイ中の音声

engine-spec は「リプレイは演出の待ち時間をゼロにした通常再生」と書いているが、
これを音声にそのまま適用すると**リプレイ中に SE が全部鳴る**。

| 種別 | リプレイ中 |
|---|---|
| `@se` | 鳴らさない（状態ではなく発火のため） |
| `@bgm` | `snapshot.bgm` を更新するだけ。リプレイ終了時に1回だけ実際の再生と同期する |

同期処理 `audio.syncBgm(name)` は「今鳴っているものと同じ名前なら何もしない」であり、
これは `@bgm` の同名再指定の意味論そのもの。通常再生でも同じ関数を通すため、
リプレイ専用の分岐は `if (!replaying)` の1箇所に収まる。

### 10. `phase` に `ended` を足す

architecture.md の `phase` は `performing / typing / waiting` の3つだが、
**台本の終端に到達した状態がこれで表せない。** `waiting` のままにすると
クリックで進めるように見えて何も起きない。`ended` を足す。

`ended` はセーブ可能点ではない（終端でオートセーブを打つと、
ロードしたとき最後の1ブロックだけ読める状態になる）。

---

## ファイル構成

| ファイル | 責務 |
|---|---|
| `src/engine/index.ts` | 作品が触ってよい唯一の入口。`boot()` だけを export |
| `src/engine/core/script.ts` | コンパイル済み台本の型。コンパイラもここを import する |
| `src/engine/core/state.ts` | `EngineState` の型と初期値 |
| `src/engine/core/runtime.ts` | step の実行、進行制御、購読 |
| `src/engine/core/save.ts` | スナップショット・セーブ・ロード・リプレイ |
| `src/engine/core/read.ts` | 既読ハッシュの Set |
| `src/engine/core/backlog.ts` | リングバッファ |
| `src/engine/core/audio.ts` | Web Audio。BGM/SE/GainNode |
| `src/engine/core/storage.ts` | 差し替え可能なストレージ interface と localStorage 実装 |
| `src/engine/core/settings.ts` | 読者設定（文字送り・音量）の型と保存 |
| `src/engine/ui/App.tsx` | タイトル画面と本編の切替 |
| `src/engine/ui/Stage.tsx` | 背景・立ち絵・回想オーバーレイ |
| `src/engine/ui/MessageBox.tsx` | ネームプレートと本文。ページ分割の測定 |
| `src/engine/ui/Title.tsx` | タイトル画面。音声 unlock の起点 |
| `src/engine/ui/Backlog.tsx` | 読み返し |
| `src/engine/ui/SaveMenu.tsx` | セーブ・ロード |
| `src/engine/ui/Settings.tsx` | 読者設定 |
| `src/engine/ui/useEngine.ts` | `useSyncExternalStore` のラッパ |
| `src/engine/ui/style.css` | ステージのスケーリングと全体のスタイル |
| `tools/wn-compile/index.ts` | Vite プラグイン本体 |
| `tools/wn-compile/parse.ts` | 行指向パーサ |
| `tools/wn-compile/assets.ts` | `public/` のスキャンと存在チェック |
| `tools/gen-dummy-assets.mjs` | 動作確認用のダミー素材を生成する |
| `novels/kieta-ippen/` | 1作目。`drafts/sample-short.wn` をそのまま使う |

---

## フェーズ1: 土台と最小パーサ

### Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
  `eslint.config.js`, `.gitignore`, `src/engine/wn.d.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` / `npm run lint` / `npm run typecheck` が動く状態

- [x] **Step 1: 依存をインストールする**

```bash
npm init -y
npm i react react-dom
npm i -D vite @vitejs/plugin-react typescript vitest \
        @types/react @types/react-dom \
        eslint @eslint/js typescript-eslint
```

- [x] **Step 2: `package.json` の scripts を書く**

`npm init -y` が作った内容を、以下で置き換える（`name` と `version` は残す）。

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:all": "for d in novels/*/; do NOVEL=$(basename $d) vite build || exit 1; done",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

`build:all` の `|| exit 1` は、1作品のビルドが失敗したときに残りを走らせず止めるため。

- [x] **Step 3: `tsconfig.json` を書く**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": { "@engine": ["./src/engine/index.ts"] }
  },
  "include": ["src", "tools", "novels", "tests", "vite.config.ts", "vitest.config.ts"]
}
```

- [x] **Step 4: `.gitignore` を書く**

```
node_modules/
dist/
```

- [x] **Step 5: `vite.config.ts` を書く**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { wnCompile } from './tools/wn-compile/index.ts'

export default defineConfig(() => {
  const novel = process.env.NOVEL
  if (!novel) {
    throw new Error(
      '環境変数 NOVEL に作品ディレクトリ名を指定してください（例: NOVEL=kieta-ippen npm run dev）',
    )
  }
  const root = resolve(import.meta.dirname, 'novels', novel)
  return {
    root,
    base: './',
    build: {
      outDir: resolve(import.meta.dirname, 'dist', novel),
      emptyOutDir: true,
    },
    resolve: {
      alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
    },
    plugins: [react(), wnCompile({ root })],
  }
})
```

`wnCompile` はまだ存在しない。Task 4 で作るまでこの行はコメントアウトしておき、
Task 4 で戻して有効化する。

- [x] **Step 6: `vitest.config.ts` を書く**

`vite.config.ts` は `NOVEL` を要求するため、テストは別 config を使う。

```ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@engine': resolve(import.meta.dirname, 'src/engine/index.ts') },
  },
})
```

- [x] **Step 7: `src/engine/wn.d.ts` を書く**

```ts
declare module '*.wn' {
  import type { CompiledScript } from './core/script.ts'
  const script: CompiledScript
  export default script
}
```

- [x] **Step 8: `eslint.config.js` で境界を強制する**

後の設定オブジェクトが同じルールを上書きするため、`core/` には
エンジン共通の禁止パターンも**再掲してマージする**。分けて書くと共通分が消える。

```js
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** エンジン全体に共通の禁止 import */
const engineCommon = [
  { group: ['**/novels/**'], message: 'エンジンは特定の作品に依存してはならない' },
  { group: ['**/tools/**'], message: '依存の向きは tools → engine の一方向' },
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: engineCommon }],
    },
  },
  {
    files: ['src/engine/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...engineCommon,
          { group: ['**/ui/**'], message: 'core は ui に依存してはならない' },
          { group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
            message: 'core は React 非依存でなければならない' },
        ],
      }],
    },
  },
  {
    files: ['novels/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/src/engine/**'], message: '作品は @engine 以外から import してはならない' },
        ],
      }],
    },
  },
)
```

- [x] **Step 9: 境界が実際に効くことを確認する**

一時ファイルを作って lint が落ちることを確かめ、確認できたら消す。

```bash
mkdir -p src/engine/core
echo "import { useState } from 'react'; export const x = useState" > src/engine/core/__boundary_check.ts
npx eslint src/engine/core/__boundary_check.ts
```

期待: `core は React 非依存でなければならない` で FAIL する。

```bash
rm src/engine/core/__boundary_check.ts
```

- [x] **Step 10: スモークテストを書いて走らせる**

```ts
// tests/smoke.test.ts
import { describe, expect, it } from 'vitest'

describe('テスト環境', () => {
  it('動く', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: PASS（1 test）

- [x] **Step 11: コミット**

```bash
git add -A
git commit -m "chore: Vite / TypeScript / Vitest / ESLint の土台を用意する"
```

---

### Task 2: パーサ — 第一原則と本文ブロック

**Files:**
- Create: `src/engine/core/script.ts`, `tools/wn-compile/parse.ts`
- Test: `tests/compile/parse.test.ts`

**Interfaces:**
- Produces:
  - `type Step`, `type Scene`, `type CompiledScript`, `type Pos`（`core/script.ts`）
  - `parse(source: string, file: string): ParseResult`（`tools/wn-compile/parse.ts`）
  - `class WnError extends Error`（`file`/`line` を持つ）

**この Task で作るのは「本文とシーンだけを理解するパーサ」。** `@` 命令は Task 3。

- [x] **Step 1: `src/engine/core/script.ts` に型を書く**

```ts
export type Pos = 'left' | 'center' | 'right'

export type Step =
  | { t: 'text'; i: number; h: string; speaker: string | null; body: string }
  | { t: 'bg'; name: string; fade: number }
  | { t: 'bgm'; name: string }
  | { t: 'bgmStop'; fade: number }
  | { t: 'se'; name: string }
  | { t: 'show'; id: string; expr: string | null; pos: Pos | null }
  | { t: 'hide'; id: string | null }        // null は全員退場（@hide *）
  | { t: 'wait'; ms: number }
  | { t: 'speed'; value: 'slow' | 'normal' }
  | { t: 'flashback'; on: boolean }

export type Scene = {
  id: string
  steps: Step[]
}

export type CompiledScript = {
  title: string
  protagonist: string | null
  scenes: Scene[]
  /** 論理名（'bg/clubroom_day'）→ 実パス（'bg/clubroom_day.svg'） */
  assets: Record<string, string>
}
```

`i` は**シーン内のローカル連番**。演出 step には振らない。

- [x] **Step 2: 失敗するテストを書く**

```ts
// tests/compile/parse.test.ts
import { describe, expect, it } from 'vitest'
import { parse } from '../../tools/wn-compile/parse.ts'

describe('第一原則', () => {
  it('記法を1つも含まないプレーンテキストが全行本文になる', () => {
    const src = [
      '放課後の部室は、いつも通り紙の匂いがした。',
      '',
      '窓際の机に部誌の束が積んである。',
    ].join('\n')

    const r = parse(src, 'test.wn')

    expect(r.scenes).toHaveLength(1)
    expect(r.scenes[0].steps).toEqual([
      { t: 'text', i: 0, speaker: null, body: '放課後の部室は、いつも通り紙の匂いがした。' },
      { t: 'text', i: 1, speaker: null, body: '窓際の机に部誌の束が積んである。' },
    ])
  })

  it('「」で始まる行も本文として通る', () => {
    const r = parse('「いちばん地味なやつ」', 'test.wn')
    expect(r.scenes[0].steps[0]).toMatchObject({ t: 'text', body: '「いちばん地味なやつ」' })
  })

  it('空行とコメントは捨てられ、連番に影響しない', () => {
    const r = parse('一行目\n\n# コメント\n二行目', 'test.wn')
    const texts = r.scenes[0].steps.filter((s) => s.t === 'text')
    expect(texts.map((s) => s.i)).toEqual([0, 1])
  })
})
```

`h`（既読ハッシュ）は Task 4 で足すため、この時点の `parse` は `h` を出さない。
型を満たすのは Task 4 以降のコンパイラ全体であり、`parse` の戻り値は
`h` を持たない中間表現とする（Step 3 の `ParseResult` を参照）。

- [x] **Step 3: 実行して落ちることを確認する**

Run: `npx vitest run tests/compile/parse.test.ts`
Expected: FAIL（`Cannot find module '../../tools/wn-compile/parse.ts'`）

- [x] **Step 4: `tools/wn-compile/parse.ts` を書く**

```ts
import type { Pos, Step } from '../../src/engine/core/script.ts'

/** ハッシュを埋める前の中間表現。`h` だけが欠けている */
export type RawStep =
  | (Omit<Extract<Step, { t: 'text' }>, 'h'>)
  | Exclude<Step, { t: 'text' }>

export type RawScene = { id: string; steps: RawStep[] }

export type ParseResult = {
  title: string
  protagonist: string | null
  scenes: RawScene[]
}

export class WnError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`)
    this.name = 'WnError'
  }
}

const DEFAULT_SCENE_ID = '（無題）'

export function parse(source: string, file: string): ParseResult {
  const scenes: RawScene[] = []
  const seen = new Set<string>()
  let title = ''
  let protagonist: string | null = null
  let current: RawScene | null = null
  let index = 0          // シーン内の本文ブロック連番
  let speaker: string | null = null
  let hasSpeaker = false // 直前の行が `>` だったか

  /** シーン宣言が1つも無い台本のために、本文が来た時点で暗黙のシーンを作る */
  const scene = (): RawScene => {
    if (!current) {
      current = { id: DEFAULT_SCENE_ID, steps: [] }
      scenes.push(current)
      seen.add(DEFAULT_SCENE_ID)
    }
    return current
  }

  const lines = source.split(/\r?\n/)
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim()
    const lineNo = n + 1

    if (line === '' || line.startsWith('#')) continue

    if (line.startsWith('=')) {
      const rest = line.slice(1).trim()
      const m = /^scene\s+(.+)$/.exec(rest)
      if (!m) throw new WnError(file, lineNo, `シーン宣言は '= scene <名前>' と書く: ${line}`)
      const id = m[1].trim()
      if (seen.has(id)) throw new WnError(file, lineNo, `シーン名が重複している: ${id}`)
      seen.add(id)
      current = { id, steps: [] }
      scenes.push(current)
      index = 0
      hasSpeaker = false
      speaker = null
      continue
    }

    if (line.startsWith('>')) {
      speaker = line.slice(1).trim() || null
      hasSpeaker = true
      continue
    }

    if (line.startsWith('@')) {
      // Task 3 で実装する
      continue
    }

    scene().steps.push({ t: 'text', i: index++, speaker: hasSpeaker ? speaker : null, body: line })
    hasSpeaker = false
    speaker = null
  }

  return { title, protagonist, scenes }
}
```

`>` の状態を1ブロックで捨てるために `hasSpeaker` を毎回落とす。
これが「`>` は直後の1ブロックにのみ効く」の実装。

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/compile/parse.test.ts`
Expected: PASS（3 tests）

- [x] **Step 6: シーンと話者のテストを足す**

```ts
describe('シーン宣言', () => {
  it('シーンごとに連番がリセットされる', () => {
    const r = parse('= scene A\n本文1\n本文2\n= scene B\n本文3', 'test.wn')
    expect(r.scenes.map((s) => s.id)).toEqual(['A', 'B'])
    expect(r.scenes[0].steps.map((s) => (s.t === 'text' ? s.i : -1))).toEqual([0, 1])
    expect(r.scenes[1].steps.map((s) => (s.t === 'text' ? s.i : -1))).toEqual([0])
  })

  it('シーン名の重複が行番号付きで落ちる', () => {
    expect(() => parse('= scene A\n本文\n= scene A\n本文', 'test.wn'))
      .toThrow('test.wn:3: シーン名が重複している: A')
  })
})

describe('話者', () => {
  it('> は直後の1ブロックにだけ効く', () => {
    const r = parse('>ミカ\n「おつかれ」\n彼女は笑った。', 'test.wn')
    const texts = r.scenes[0].steps.filter((s) => s.t === 'text')
    expect(texts[0]).toMatchObject({ speaker: 'ミカ', body: '「おつかれ」' })
    expect(texts[1]).toMatchObject({ speaker: null, body: '彼女は笑った。' })
  })

  it('引数なしの > は話者を伏せる（話者なしと同じ扱い）', () => {
    const r = parse('>\n「……」', 'test.wn')
    expect(r.scenes[0].steps[0]).toMatchObject({ speaker: null })
  })
})
```

- [x] **Step 7: テストを走らせる**

Run: `npx vitest run tests/compile/parse.test.ts`
Expected: PASS（7 tests）

- [x] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: 本文・シーン・話者を読む台本パーサを追加する"
```

---

### Task 3: パーサ — 演出命令

**Files:**
- Modify: `tools/wn-compile/parse.ts`
- Test: `tests/compile/parse.test.ts`

**Interfaces:**
- Consumes: `parse()`, `WnError`（Task 2）
- Produces: 10命令すべてが `Step` に変換される

- [x] **Step 1: 失敗するテストを書く**

```ts
import { parse, type RawStep } from '../../tools/wn-compile/parse.ts'

const steps = (src: string): RawStep[] => parse(src, 'test.wn').scenes[0]?.steps ?? []

describe('命令のパース', () => {
  it('@bg', () => {
    expect(steps('@bg clubroom_day fade:600\nx')[0])
      .toEqual({ t: 'bg', name: 'clubroom_day', fade: 600 })
  })

  it('@bg の fade 省略時は 0', () => {
    expect(steps('@bg clubroom_day\nx')[0]).toEqual({ t: 'bg', name: 'clubroom_day', fade: 0 })
  })

  it('@bgm', () => {
    expect(steps('@bgm daily\nx')[0]).toEqual({ t: 'bgm', name: 'daily' })
  })

  it('@bgm stop は別の step になる', () => {
    expect(steps('@bgm stop fade:1200\nx')[0]).toEqual({ t: 'bgmStop', fade: 1200 })
  })

  it('@se', () => {
    expect(steps('@se door_open\nx')[0]).toEqual({ t: 'se', name: 'door_open' })
  })

  it('@show の全指定', () => {
    expect(steps('@show mika normal pos:center\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: 'normal', pos: 'center' })
  })

  it('@show の省略は null になり、実行時に現在値を維持する', () => {
    expect(steps('@show mika smile\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: 'smile', pos: null })
    expect(steps('@show mika pos:left\nx')[0])
      .toEqual({ t: 'show', id: 'mika', expr: null, pos: 'left' })
  })

  it('@hide と @hide *', () => {
    expect(steps('@hide mika\nx')[0]).toEqual({ t: 'hide', id: 'mika' })
    expect(steps('@hide *\nx')[0]).toEqual({ t: 'hide', id: null })
  })

  it('@wait / @speed / @flashback', () => {
    expect(steps('@wait 300\nx')[0]).toEqual({ t: 'wait', ms: 300 })
    expect(steps('@speed slow\nx')[0]).toEqual({ t: 'speed', value: 'slow' })
    expect(steps('@flashback on\nx')[0]).toEqual({ t: 'flashback', on: true })
    expect(steps('@flashback off\nx')[0]).toEqual({ t: 'flashback', on: false })
  })

  it('@title / @protagonist はメタに抜ける', () => {
    const r = parse('@title 消えた一篇\n@protagonist ハル\n本文', 'test.wn')
    expect(r.title).toBe('消えた一篇')
    expect(r.protagonist).toBe('ハル')
    expect(r.scenes[0].steps).toHaveLength(1)
  })

  it('@title は空白を含む文字列をそのまま取る', () => {
    expect(parse('@title 消えた 一篇\nx', 'test.wn').title).toBe('消えた 一篇')
  })
})

describe('コンパイルエラー', () => {
  it('未知の命令が行番号付きで落ちる', () => {
    expect(() => parse('本文\n@bgx a', 'test.wn'))
      .toThrow("test.wn:2: 未知の命令: @bgx")
  })

  it('引数不足が落ちる', () => {
    expect(() => parse('@bg', 'test.wn')).toThrow('test.wn:1: @bg は背景名が要る')
  })

  it('引数の型違いが落ちる', () => {
    expect(() => parse('@wait すぐ', 'test.wn'))
      .toThrow('test.wn:1: @wait はミリ秒（整数）が要る: すぐ')
    expect(() => parse('@speed fast', 'test.wn'))
      .toThrow("test.wn:1: @speed は slow か normal: fast")
    expect(() => parse('@show mika pos:up', 'test.wn'))
      .toThrow('test.wn:1: pos は left / center / right のどれか: up')
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/compile/parse.test.ts`
Expected: FAIL（`@` 行が捨てられているため、`steps()[0]` が text になる）

- [x] **Step 3: 引数を読むヘルパを書く**

`tools/wn-compile/parse.ts` の末尾に足す。

```ts
type Args = {
  /** 位置引数（key:value を除いたもの） */
  pos: string[]
  /** key:value 形式の引数 */
  named: Map<string, string>
}

function splitArgs(rest: string): Args {
  const pos: string[] = []
  const named = new Map<string, string>()
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    const at = tok.indexOf(':')
    if (at > 0) named.set(tok.slice(0, at), tok.slice(at + 1))
    else pos.push(tok)
  }
  return { pos, named }
}

function readMs(a: Args, key: string, file: string, line: number, cmd: string): number {
  const raw = a.named.get(key)
  if (raw === undefined) return 0
  if (!/^\d+$/.test(raw)) throw new WnError(file, line, `${cmd} の ${key} はミリ秒（整数）が要る: ${raw}`)
  return Number(raw)
}

function readPos(a: Args, file: string, line: number): Pos | null {
  const raw = a.named.get('pos')
  if (raw === undefined) return null
  if (raw !== 'left' && raw !== 'center' && raw !== 'right') {
    throw new WnError(file, line, `pos は left / center / right のどれか: ${raw}`)
  }
  return raw
}
```

- [x] **Step 4: 命令のディスパッチを書く**

`parse()` の中の `if (line.startsWith('@'))` ブロックを、以下で置き換える。
`title` / `protagonist` は `parse()` のローカル変数に代入するため、この処理は
`parse()` の内部に置く（切り出さない）。

```ts
    if (line.startsWith('@')) {
      const sp = line.search(/\s/)
      const cmd = (sp < 0 ? line : line.slice(0, sp)).slice(1)
      const rest = sp < 0 ? '' : line.slice(sp + 1).trim()
      const a = splitArgs(rest)
      const need = (what: string): string => {
        if (a.pos.length === 0) throw new WnError(file, lineNo, `@${cmd} は${what}が要る`)
        return a.pos[0]
      }

      switch (cmd) {
        case 'title':
          if (rest === '') throw new WnError(file, lineNo, '@title はタイトル文字列が要る')
          title = rest
          break

        case 'protagonist':
          if (rest === '') throw new WnError(file, lineNo, '@protagonist は表示名が要る')
          protagonist = rest
          break

        case 'bg':
          scene().steps.push({
            t: 'bg',
            name: need('背景名'),
            fade: readMs(a, 'fade', file, lineNo, '@bg'),
          })
          break

        case 'bgm': {
          const name = need('BGM 名か stop')
          if (name === 'stop') {
            scene().steps.push({ t: 'bgmStop', fade: readMs(a, 'fade', file, lineNo, '@bgm stop') })
          } else {
            scene().steps.push({ t: 'bgm', name })
          }
          break
        }

        case 'se':
          scene().steps.push({ t: 'se', name: need('効果音名') })
          break

        case 'show':
          scene().steps.push({
            t: 'show',
            id: need('キャラ名'),
            expr: a.pos[1] ?? null,
            pos: readPos(a, file, lineNo),
          })
          break

        case 'hide': {
          const id = need('キャラ名か *')
          scene().steps.push({ t: 'hide', id: id === '*' ? null : id })
          break
        }

        case 'wait': {
          const ms = need('ミリ秒')
          if (!/^\d+$/.test(ms)) {
            throw new WnError(file, lineNo, `@wait はミリ秒（整数）が要る: ${ms}`)
          }
          scene().steps.push({ t: 'wait', ms: Number(ms) })
          break
        }

        case 'speed': {
          const v = need('slow か normal')
          if (v !== 'slow' && v !== 'normal') {
            throw new WnError(file, lineNo, `@speed は slow か normal: ${v}`)
          }
          scene().steps.push({ t: 'speed', value: v })
          break
        }

        case 'flashback': {
          const v = need('on か off')
          if (v !== 'on' && v !== 'off') {
            throw new WnError(file, lineNo, `@flashback は on か off: ${v}`)
          }
          scene().steps.push({ t: 'flashback', on: v === 'on' })
          break
        }

        default:
          throw new WnError(file, lineNo, `未知の命令: @${cmd}`)
      }
      continue
    }
```

`@wait` だけ位置引数がミリ秒なので `readMs` を通さず個別に検証する。

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/compile/parse.test.ts`
Expected: PASS（20 tests）

- [x] **Step 6: 実際の台本が通ることを確認する**

```ts
// tests/compile/sample.test.ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from '../../tools/wn-compile/parse.ts'

describe('drafts/sample-short.wn', () => {
  const src = readFileSync(new URL('../../drafts/sample-short.wn', import.meta.url), 'utf8')

  it('パースが通り、7シーンになる', () => {
    const r = parse(src, 'sample-short.wn')
    expect(r.title).toBe('消えた一篇')
    expect(r.protagonist).toBe('ハル')
    expect(r.scenes.map((s) => s.id)).toEqual([
      '部室・放課後', '部室・違和感', '廊下', '回想・昨日の部室', '屋上前', '引き',
    ])
  })

  it('演出行を何行挟んでも本文の連番は詰まっている', () => {
    const r = parse(src, 'sample-short.wn')
    for (const scene of r.scenes) {
      const ids = scene.steps.filter((s) => s.t === 'text').map((s) => s.i)
      expect(ids).toEqual(ids.map((_, k) => k))
    }
  })
})
```

Run: `npx vitest run tests/compile/`
Expected: PASS

- [x] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: 10命令のパースとコンパイルエラーを実装する"
```

---

### Task 4: 既読ハッシュ・素材解決・Vite プラグイン

**Files:**
- Create: `tools/wn-compile/assets.ts`, `tools/wn-compile/index.ts`,
  `novels/kieta-ippen/{index.html,main.ts,script.wn}`, `tools/gen-dummy-assets.mjs`
- Modify: `vite.config.ts`（Step 5 のコメントアウトを戻す）
- Test: `tests/compile/compile.test.ts`

**Interfaces:**
- Consumes: `parse()`, `WnError`, `RawScene`（Task 2-3）
- Produces:
  - `compile(source: string, file: string, publicDir: string): CompiledScript`
  - `wnCompile(opts: { root: string }): Plugin`
  - `scanAssets(publicDir: string): Record<string, string>`

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/compile/compile.test.ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compile } from '../../tools/wn-compile/index.ts'

/** bg/rain.svg と chara/mika_normal.svg を持つ public/ を作る */
function fixturePublic(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wn-'))
  mkdirSync(join(dir, 'bg'), { recursive: true })
  mkdirSync(join(dir, 'chara'), { recursive: true })
  writeFileSync(join(dir, 'bg', 'rain.svg'), '<svg/>')
  writeFileSync(join(dir, 'chara', 'mika_normal.svg'), '<svg/>')
  return dir
}

describe('既読ハッシュ', () => {
  const pub = fixturePublic()

  it('12桁の16進で、シーン名・話者・本文から決まる', () => {
    const r = compile('= scene A\n>ミカ\n「うん」', 'test.wn', pub)
    const step = r.scenes[0].steps[0]
    expect(step.t).toBe('text')
    if (step.t !== 'text') return
    expect(step.h).toMatch(/^[0-9a-f]{12}$/)
  })

  it('シーンが違えば同じ本文でもハッシュが変わる', () => {
    const a = compile('= scene A\n>ミカ\n「うん」', 'test.wn', pub)
    const b = compile('= scene B\n>ミカ\n「うん」', 'test.wn', pub)
    const ha = a.scenes[0].steps[0]
    const hb = b.scenes[0].steps[0]
    if (ha.t !== 'text' || hb.t !== 'text') throw new Error('text ではない')
    expect(ha.h).not.toBe(hb.h)
  })

  it('本文を変えたブロックだけハッシュが変わる', () => {
    const a = compile('= scene A\n一行目\n二行目', 'test.wn', pub)
    const b = compile('= scene A\n一行目\n二行目（改稿）', 'test.wn', pub)
    const ax = a.scenes[0].steps
    const bx = b.scenes[0].steps
    if (ax[0].t !== 'text' || bx[0].t !== 'text') throw new Error('text ではない')
    if (ax[1].t !== 'text' || bx[1].t !== 'text') throw new Error('text ではない')
    expect(ax[0].h).toBe(bx[0].h)
    expect(ax[1].h).not.toBe(bx[1].h)
  })

  it('本文ブロックを挿入しても既存ブロックのハッシュは変わらない', () => {
    const a = compile('= scene A\n一行目\n二行目', 'test.wn', pub)
    const b = compile('= scene A\n一行目\n挿入した行\n二行目', 'test.wn', pub)
    const hashes = (r: ReturnType<typeof compile>) =>
      r.scenes[0].steps.flatMap((s) => (s.t === 'text' ? [s.h] : []))
    expect(hashes(a).every((h) => hashes(b).includes(h))).toBe(true)
  })
})

describe('素材の解決', () => {
  const pub = fixturePublic()

  it('assets に論理名 → 実パスが入る', () => {
    const r = compile('@bg rain\n本文', 'test.wn', pub)
    expect(r.assets['bg/rain']).toBe('bg/rain.svg')
    expect(r.assets['chara/mika_normal']).toBe('chara/mika_normal.svg')
  })

  it('素材の置き忘れがビルドエラーになる', () => {
    expect(() => compile('@bg missing\n本文', 'test.wn', pub))
      .toThrow('test.wn:1: 素材が見つからない: bg/missing')
  })

  it('表情を省略した @show は存在チェックしない', () => {
    expect(() => compile('@show mika pos:left\n本文', 'test.wn', pub)).not.toThrow()
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/compile/compile.test.ts`
Expected: FAIL（`tools/wn-compile/index.ts` が無い）

- [x] **Step 3: `tools/wn-compile/assets.ts` を書く**

```ts
import { existsSync, readdirSync } from 'node:fs'
import { join, parse as parsePath } from 'node:path'

const KINDS = ['bg', 'bgm', 'se', 'chara'] as const

/**
 * public/{bg,bgm,se,chara}/ を走査して、論理名 → 実パスの表を作る。
 * 論理名は 'bg/rain_street'、実パスは 'bg/rain_street.webp'（public/ からの相対）。
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
```

同名で拡張子違いのファイルが両方あった場合は後勝ちになる。台本側は拡張子を書かないため、
どちらが選ばれるかは不定になる。**素材は1つの名前につき1ファイルだけ置く。**

- [x] **Step 4: `tools/wn-compile/index.ts` を書く**

```ts
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import type { CompiledScript, Scene, Step } from '../../src/engine/core/script.ts'
import { scanAssets } from './assets.ts'
import { parse, WnError, type RawStep } from './parse.ts'

/** engine-spec の定義: シーン名 \n 話者名 \n 本文 を SHA-256、先頭12桁 */
function hash(sceneId: string, speaker: string | null, body: string): string {
  return createHash('sha256')
    .update(`${sceneId}\n${speaker ?? ''}\n${body}`, 'utf8')
    .digest('hex')
    .slice(0, 12)
}

/** 台本が参照している素材が assets に存在するか確かめる */
function checkAssets(scenes: { steps: RawStep[] }[], assets: Record<string, string>, file: string) {
  const missing = (key: string) => {
    if (!(key in assets)) throw new WnError(file, 1, `素材が見つからない: ${key}`)
  }
  for (const scene of scenes) {
    for (const step of scene.steps) {
      switch (step.t) {
        case 'bg':  missing(`bg/${step.name}`); break
        case 'bgm': missing(`bgm/${step.name}`); break
        case 'se':  missing(`se/${step.name}`); break
        case 'show':
          // 表情を省略した @show は、その時点の表情がビルド時に確定しないため検査しない
          if (step.expr) missing(`chara/${step.id}_${step.expr}`)
          break
      }
    }
  }
}

export function compile(source: string, file: string, publicDir: string): CompiledScript {
  const raw = parse(source, file)
  const assets = scanAssets(publicDir)
  checkAssets(raw.scenes, assets, file)

  const scenes: Scene[] = raw.scenes.map((scene) => ({
    id: scene.id,
    steps: scene.steps.map((step): Step =>
      step.t === 'text'
        ? { ...step, h: hash(scene.id, step.speaker, step.body) }
        : step,
    ),
  }))

  return { title: raw.title, protagonist: raw.protagonist, scenes, assets }
}

export function wnCompile(opts: { root: string }): Plugin {
  return {
    name: 'wn-compile',
    transform(code, id) {
      if (!id.endsWith('.wn')) return
      const script = compile(code, id, join(opts.root, 'public'))
      return { code: `export default ${JSON.stringify(script)}`, map: null }
    },
  }
}
```

**素材の欠落は行番号を持てない。** `RawStep` は行番号を保持していないため
`file:1` を指す。行番号まで出すには step に行番号を持たせる必要があり、
実行時に不要な情報が全 step に載る。素材名はエラーメッセージに出るため、
どの行かは検索すれば分かる。**この妥協は意図的なもの。**

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/compile/compile.test.ts`
Expected: PASS（7 tests）

- [x] **Step 6: ダミー素材の生成スクリプトを書く**

`novels/kieta-ippen/public/` に、動作確認用の素材を作る。
背景と立ち絵は SVG（`<img src>` でそのまま表示できる）、
音声は WAV（Node だけで生成でき、実際に鳴るのでBGM切替を耳で確認できる）。

```js
// tools/gen-dummy-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
if (!out) {
  console.error('使い方: node tools/gen-dummy-assets.mjs novels/<作品ID>/public')
  process.exit(1)
}

const BG = {
  clubroom_day:     ['#e8dcc0', '部室・昼'],
  corridor_evening: ['#3a4a63', '廊下・夕'],
  rooftop_door:     ['#6b7a8f', '屋上前'],
  black:            ['#000000', ''],
}
const CHARA = {
  mika:  '#d98b8b',
  tooru: '#7fa8d9',
}
const EXPR = ['normal', 'smile', 'surprised', 'think', 'sad']
const BGM = { daily: 392, tension: 233, memory: 330 }   // Hz
const SE = { door_open: 180, paper: 900, wind: 300, phone: 1200 }

/** 1280x720 の単色板に名前を書いた SVG */
function bgSvg(color, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<rect width="1280" height="720" fill="${color}"/>
<text x="640" y="380" font-size="64" text-anchor="middle" fill="#00000066">${label}</text>
</svg>`
}

/** 立ち絵。透過の板に名前と表情を書く */
function charaSvg(color, id, expr) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700">
<rect x="60" y="120" width="280" height="580" rx="24" fill="${color}" opacity="0.85"/>
<circle cx="200" cy="130" r="90" fill="${color}"/>
<text x="200" y="300" font-size="44" text-anchor="middle" fill="#fff">${id}</text>
<text x="200" y="360" font-size="32" text-anchor="middle" fill="#ffffffcc">${expr}</text>
</svg>`
}

/** 16bit モノラル 22050Hz のサイン波 WAV */
function wav(freq, seconds) {
  const rate = 22050
  const n = Math.floor(rate * seconds)
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) {
    const fade = Math.min(1, i / 400, (n - i) / 400)   // 端のプチノイズを消す
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 6000 * fade), i * 2)
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8)
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20)
  head.writeUInt16LE(1, 22); head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28)
  head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34)
  head.write('data', 36); head.writeUInt32LE(data.length, 40)
  return Buffer.concat([head, data])
}

for (const kind of ['bg', 'bgm', 'se', 'chara']) mkdirSync(join(out, kind), { recursive: true })

for (const [name, [color, label]] of Object.entries(BG)) {
  writeFileSync(join(out, 'bg', `${name}.svg`), bgSvg(color, label))
}
for (const [id, color] of Object.entries(CHARA)) {
  for (const expr of EXPR) {
    writeFileSync(join(out, 'chara', `${id}_${expr}.svg`), charaSvg(color, id, expr))
  }
}
for (const [name, freq] of Object.entries(BGM)) {
  writeFileSync(join(out, 'bgm', `${name}.wav`), wav(freq, 4))
}
for (const [name, freq] of Object.entries(SE)) {
  writeFileSync(join(out, 'se', `${name}.wav`), wav(freq, 0.25))
}

console.log(`ダミー素材を ${out} に生成した`)
```

- [x] **Step 7: 1作目のディレクトリを作る**

```bash
mkdir -p novels/kieta-ippen
cp drafts/sample-short.wn novels/kieta-ippen/script.wn
node tools/gen-dummy-assets.mjs novels/kieta-ippen/public
```

`novels/kieta-ippen/index.html`

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>消えた一篇</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`novels/kieta-ippen/main.ts`

```ts
import { boot } from '@engine'
import script from './script.wn'

boot({
  mount: document.getElementById('app')!,
  script,
  novelId: 'kieta-ippen',
})
```

`boot` はまだ存在しない。Task 7 で作るまで型エラーになる。

- [x] **Step 8: `vite.config.ts` の `wnCompile` を有効化する**

Task 1 Step 5 でコメントアウトした import と `plugins` の行を戻す。

- [x] **Step 9: コンパイルが通ることを確認する**

```bash
npx vitest run
```
Expected: PASS（全テスト）

素材の存在チェックが実台本に対して通ることも確かめる。

```ts
// tests/compile/sample.test.ts の import に足す
import { fileURLToPath } from 'node:url'
import { compile } from '../../tools/wn-compile/index.ts'

// describe の中に足す
it('1作目の素材がすべて揃っている', () => {
  const src = readFileSync(new URL('../../novels/kieta-ippen/script.wn', import.meta.url), 'utf8')
  const pub = fileURLToPath(new URL('../../novels/kieta-ippen/public', import.meta.url))
  expect(() => compile(src, 'script.wn', pub)).not.toThrow()
})
```

- [x] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: 既読ハッシュ・素材解決・Vite プラグインを実装し、1作目を用意する"
```

---

## フェーズ2: コアの骨格

### Task 5: EngineState と購読

**Files:**
- Create: `src/engine/core/state.ts`
- Test: `tests/core/state.test.ts`

**Interfaces:**
- Consumes: `Pos`（`core/script.ts`）
- Produces:
  - `type Snapshot`, `type Phase`, `type Sprite`, `type BacklogEntry`, `type EngineState`
  - `initialState(sceneId: string): EngineState`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// tests/core/state.test.ts
import { describe, expect, it } from 'vitest'
import { initialState } from '../../src/engine/core/state.ts'

describe('EngineState', () => {
  it('初期状態は何も表示していない waiting 前の状態', () => {
    const s = initialState('部室・放課後')
    expect(s.snapshot).toEqual({
      bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {},
    })
    expect(s.progress).toEqual({ scene: '部室・放課後', index: 0, pc: 0 })
    expect(s.view.phase).toBe('performing')
    expect(s.view.currentText).toBeNull()
  })

  it('スナップショットは structuredClone で丸ごと複製できる', () => {
    const s = initialState('A')
    s.snapshot.sprites = [{ id: 'mika', expr: 'normal', pos: 'center' }]
    const copy = structuredClone(s.snapshot)
    copy.sprites[0].expr = 'smile'
    expect(s.snapshot.sprites[0].expr).toBe('normal')
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/state.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `src/engine/core/state.ts` を書く**

```ts
import type { Pos } from './script.ts'

export type Sprite = { id: string; expr: string; pos: Pos }

/** シーン境界で持ち越され、セーブに入る層 */
export type Snapshot = {
  bg: string | null
  bgm: string | null
  sprites: Sprite[]
  speed: 'slow' | 'normal'
  flashback: boolean
  vars: Record<string, unknown>
}

/**
 * performing 演出中（セーブ不可）
 * typing     文字送り中（セーブ不可）
 * waiting    クリック待ち（唯一のセーブ可能点）
 * ended      台本の終端に到達した
 */
export type Phase = 'performing' | 'typing' | 'waiting' | 'ended'

export type BacklogEntry = { speaker: string | null; body: string }

export type EngineState = {
  snapshot: Snapshot
  progress: { scene: string; index: number; pc: number }
  /** 画面の一時状態。セーブに入らない */
  view: {
    phase: Phase
    currentText: { speaker: string | null; body: string } | null
    visibleChars: number
    /** ページの先頭文字位置。[0] は常に 0。UI が測定して渡す */
    pageBreaks: number[]
    page: { current: number; total: number }
    /** 進行中の演出の所要時間。CSS の transition-duration に渡す */
    fadeMs: number
    backlog: BacklogEntry[]
  }
}

export function initialState(sceneId: string): EngineState {
  return {
    snapshot: { bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {} },
    progress: { scene: sceneId, index: 0, pc: 0 },
    view: {
      phase: 'performing',
      currentText: null,
      visibleChars: 0,
      pageBreaks: [0],
      page: { current: 0, total: 1 },
      fadeMs: 0,
      backlog: [],
    },
  }
}
```

**新しい状態を足すときは、必ずどの層に置くかを選ぶこと**（engine-spec 不変条件4）。
画面の見た目を決めて、シーンをまたいで持ち越されるなら `snapshot`。そうでなければ `view`。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/state.test.ts`
Expected: PASS（2 tests）

- [x] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: EngineState の3層を定義する"
```

---

### Task 6: Runtime — 本文の実行と進行

**Files:**
- Create: `src/engine/core/runtime.ts`
- Test: `tests/core/runtime.test.ts`

**Interfaces:**
- Consumes: `CompiledScript`, `Step`（`core/script.ts`）、`EngineState`, `initialState`（`core/state.ts`）
- Produces:
  - `class Runtime`
  - `new Runtime(opts: RuntimeOptions)`
  - `runtime.getState(): EngineState`
  - `runtime.subscribe(fn: () => void): () => void`
  - `runtime.start(): Promise<void>`
  - `runtime.advance(): void`
  - `runtime.resolveAsset(key: string): string | null`
  - `type RuntimeOptions = { script; novelId: string; baseUrl: string; onSaveable?: () => void }`

**この Task の範囲は本文（`text`）と進行だけ。** 演出命令は Task 9 以降で1つずつ足す。
未実装の step は無視して次に進む。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/runtime.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { CompiledScript } from '../../src/engine/core/script.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'

/** 本文だけの台本を組み立てる */
function script(scenes: { id: string; bodies: string[] }[]): CompiledScript {
  return {
    title: 'テスト',
    protagonist: null,
    assets: {},
    scenes: scenes.map((s) => ({
      id: s.id,
      steps: s.bodies.map((body, i) => ({
        t: 'text' as const, i, h: `h${i}`, speaker: null, body,
      })),
    })),
  }
}

function make(s: CompiledScript) {
  return new Runtime({ script: s, novelId: 'test', baseUrl: 'https://example.test/novel/' })
}

describe('進行', () => {
  it('start すると最初の本文を表示してクリック待ちになる', async () => {
    const r = make(script([{ id: 'A', bodies: ['一行目', '二行目'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.currentText).toEqual({ speaker: null, body: '一行目' })
    expect(r.getState().progress).toMatchObject({ scene: 'A', index: 0 })
  })

  it('advance で次の本文に進む', async () => {
    const r = make(script([{ id: 'A', bodies: ['一行目', '二行目'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('二行目'))
    expect(r.getState().progress.index).toBe(1)
  })

  it('シーンをまたぐと連番がリセットされる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a'] }, { id: 'B', bodies: ['b'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().progress.index).toBe(0)
  })

  it('終端に到達すると ended になる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('ended'))
  })

  it('waiting でない間の advance は無視される', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.advance()
    r.advance()   // 2回目は phase が waiting でないので効かない
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('b'))
  })
})

describe('購読', () => {
  it('状態が変わるたびに通知され、state の参照が変わる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    const seen: unknown[] = []
    r.subscribe(() => seen.push(r.getState()))
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]).not.toBe(r.getState())
  })

  it('unsubscribe すると通知が止まる', async () => {
    const r = make(script([{ id: 'A', bodies: ['a', 'b'] }]))
    let n = 0
    const off = r.subscribe(() => n++)
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    off()
    const before = n
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.currentText?.body).toBe('b'))
    expect(n).toBe(before)
  })
})

describe('素材パスの解決', () => {
  it('assets の実パスを baseUrl 基準の絶対 URL にする', () => {
    const s = script([{ id: 'A', bodies: ['a'] }])
    s.assets = { 'bg/rain': 'bg/rain.svg' }
    expect(make(s).resolveAsset('bg/rain')).toBe('https://example.test/novel/bg/rain.svg')
  })

  it('無い素材は null', () => {
    expect(make(script([{ id: 'A', bodies: ['a'] }])).resolveAsset('bg/none')).toBeNull()
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/runtime.test.ts`
Expected: FAIL（モジュールが無い）

- [x] **Step 3: `src/engine/core/runtime.ts` を書く**

```ts
import type { CompiledScript, Step } from './script.ts'
import { initialState, type EngineState, type Snapshot } from './state.ts'

export type RuntimeOptions = {
  script: CompiledScript
  novelId: string
  /** 素材の相対パスを解決する基準。UI 層が document.baseURI を渡す */
  baseUrl: string
  /** セーブ可能点に到達するたびに呼ばれる（オートセーブ用） */
  onSaveable?: () => void
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class Runtime {
  readonly script: CompiledScript
  readonly novelId: string
  private readonly baseUrl: string
  private readonly onSaveable?: () => void

  private state: EngineState
  private listeners = new Set<() => void>()
  private clickResolve: (() => void) | null = null

  /** リプレイ中は待ち時間を一切消費しない */
  protected replaying = false
  /** シーン入口のスナップショット。セーブはこれを書き出す */
  protected sceneEntry: Snapshot
  protected sceneIdx = 0

  constructor(opts: RuntimeOptions) {
    this.script = opts.script
    this.novelId = opts.novelId
    this.baseUrl = opts.baseUrl
    this.onSaveable = opts.onSaveable
    this.state = initialState(opts.script.scenes[0]?.id ?? '')
    this.sceneEntry = structuredClone(this.state.snapshot)
  }

  getState = (): EngineState => this.state

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /**
   * 状態を mutate したあとに呼ぶ。3層それぞれを浅くコピーして参照を差し替えるため、
   * useSyncExternalStore が変化を検出できる。
   * sprites のような配列は mutate せず、必ず新しい配列で置き換えること。
   */
  protected emit(): void {
    this.state = {
      snapshot: { ...this.state.snapshot },
      progress: { ...this.state.progress },
      view: { ...this.state.view },
    }
    for (const fn of this.listeners) fn()
  }

  resolveAsset(key: string): string | null {
    const rel = this.script.assets[key]
    return rel ? new URL(rel, this.baseUrl).href : null
  }

  /** 台本の先頭から再生する */
  async start(): Promise<void> {
    await this.runFrom(0, 0)
  }

  /** 指定のシーン・step 位置から台本の終端まで再生する */
  protected async runFrom(sceneIdx: number, pc: number): Promise<void> {
    for (let s = sceneIdx; s < this.script.scenes.length; s++) {
      const scene = this.script.scenes[s]
      this.sceneIdx = s
      if (s !== sceneIdx || pc === 0) this.enterScene(scene.id)
      for (let p = s === sceneIdx ? pc : 0; p < scene.steps.length; p++) {
        this.state.progress.pc = p
        await this.exec(scene.steps[p])
      }
    }
    this.state.view.phase = 'ended'
    this.emit()
  }

  /** シーンに入った瞬間の状態を控える。ここがセーブの復元起点になる */
  private enterScene(sceneId: string): void {
    this.state.progress.scene = sceneId
    this.state.progress.index = 0
    this.sceneEntry = structuredClone(this.state.snapshot)
    this.emit()
  }

  protected async exec(step: Step): Promise<void> {
    switch (step.t) {
      case 'text':
        await this.execText(step)
        break
      default:
        // 演出命令は Task 9 以降で足す
        break
    }
  }

  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    this.state.progress.index = step.i
    this.state.view.currentText = { speaker: step.speaker, body: step.body }
    this.state.view.visibleChars = step.body.length
    this.state.view.phase = 'typing'
    this.emit()
    await this.waitForClick()
  }

  /**
   * クリック待ち。ここが唯一のセーブ可能点。
   * リプレイ中は待たずに素通りする（これがリプレイ専用分岐の1つ目）。
   */
  protected waitForClick(): Promise<void> {
    if (this.replaying) return Promise.resolve()
    this.state.view.phase = 'waiting'
    this.emit()
    this.onSaveable?.()
    return new Promise<void>((resolve) => { this.clickResolve = resolve })
  }

  /**
   * 演出の待ち。時間の権威はここにあり、CSS は view.fadeMs を受け取るだけ。
   * リプレイ中は待たない（これがリプレイ専用分岐の2つ目）。
   */
  protected async perform(ms: number): Promise<void> {
    if (this.replaying || ms <= 0) return
    this.state.view.phase = 'performing'
    this.state.view.fadeMs = ms
    this.emit()
    await sleep(ms)
  }

  /** 読者のクリック */
  advance(): void {
    if (this.state.view.phase !== 'waiting') return
    const resolve = this.clickResolve
    this.clickResolve = null
    resolve?.()
  }
}
```

**`transitionend` を使わない。** 待ち時間はすべて `perform()` の `sleep` が持つ。
これにより「リプレイ ＝ 待ち時間ゼロの通常再生」が `if (this.replaying) return` の2行で成立し、
step の実行コードにリプレイの分岐が1つも入らない。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/runtime.test.ts`
Expected: PASS（9 tests）

- [x] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: 本文の実行と進行を行う Runtime を追加する"
```

---

## フェーズ3: 最小UI

### Task 7: boot・タイトル画面・本編画面

**Files:**
- Create: `src/engine/index.ts`, `src/engine/ui/boot.tsx`, `src/engine/ui/App.tsx`,
  `src/engine/ui/Title.tsx`, `src/engine/ui/MessageBox.tsx`, `src/engine/ui/useEngine.ts`,
  `src/engine/ui/style.css`
- Modify: `novels/kieta-ippen/main.ts`（既に Task 4 で書いてある）

**Interfaces:**
- Consumes: `Runtime`（Task 6）
- Produces:
  - `boot(opts: BootOptions): void`（`@engine` の唯一の export）
  - `type BootOptions = { mount: HTMLElement; script: CompiledScript; novelId: string }`
  - `useEngine(runtime: Runtime): EngineState`

**このタスクの完了時点で、はじめて画面が動く。**
タイトル → クリック → 本文が出る → クリックで進む、が通る。

- [x] **Step 1: `src/engine/ui/useEngine.ts` を書く**

```ts
import { useSyncExternalStore } from 'react'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'

export function useEngine(runtime: Runtime): EngineState {
  return useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState)
}
```

第3引数（サーバ用スナップショット）は SSR しないので `getState` をそのまま渡す。

- [x] **Step 2: `src/engine/ui/style.css` を書く**

```css
:root { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }

.wn-viewport {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: #000;
}

/* 1280x720 のステージをビューポートにフィットさせ、余白はレターボックス。
   transform: scale() を使わないのは、テキストがスケール後のラスタライズになり
   大画面で眠くなるため。内部の寸法はすべて cqw / cqh で書く。 */
.wn-stage {
  position: relative;
  width: min(100vw, calc(100dvh * 16 / 9));
  height: min(100dvh, calc(100vw * 9 / 16));
  container-type: size;
  overflow: hidden;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  font-family: system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
  color: #f2f2f2;
  cursor: pointer;
}

.wn-title {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4cqw;
  background: #12141c;
}
.wn-title h1 { margin: 0; font-size: 6cqw; font-weight: 600; letter-spacing: 0.1em; }
.wn-title-buttons { display: flex; gap: 2cqw; }
.wn-button {
  padding: 1.4cqw 4cqw;
  font: inherit;
  font-size: 2.4cqw;
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.08);
  border: 0.15cqw solid rgba(255, 255, 255, 0.35);
  border-radius: 0.8cqw;
  cursor: pointer;
}
.wn-button:disabled { opacity: 0.35; cursor: default; }

.wn-messagebox {
  position: absolute;
  left: 5cqw; right: 5cqw; bottom: 4cqw;
  min-height: 21cqw;
  padding: 3cqw;
  background: rgba(8, 10, 16, 0.78);
  border-radius: 1cqw;
  font-size: 2.6cqw;
  line-height: 1.75;
}
.wn-speaker {
  position: absolute;
  top: -3.4cqw; left: 2cqw;
  padding: 0.5cqw 2cqw;
  font-size: 2.2cqw;
  background: rgba(8, 10, 16, 0.92);
  border-radius: 0.7cqw;
}
```

- [x] **Step 3: `src/engine/ui/Title.tsx` を書く**

```tsx
type Props = {
  title: string
  onStart: () => void
}

export function Title({ title, onStart }: Props) {
  return (
    <div className="wn-title">
      <h1>{title}</h1>
      <div className="wn-title-buttons">
        {/* このクリックがユーザージェスチャであり、後で音声の解禁点になる（Task 12） */}
        <button className="wn-button" onClick={onStart}>はじめから</button>
        <button className="wn-button" disabled>つづきから</button>
      </div>
    </div>
  )
}
```

「つづきから」は Task 15（セーブ）で有効化する。

- [x] **Step 4: `src/engine/ui/MessageBox.tsx` を書く**

```tsx
import type { CompiledScript } from '../core/script.ts'
import type { EngineState } from '../core/state.ts'

type Props = {
  state: EngineState
  script: CompiledScript
}

export function MessageBox({ state, script }: Props) {
  const text = state.view.currentText
  if (!text) return null

  // 話者未指定の「…」で始まる行は主人公の発話。ネームプレートに @protagonist を出す
  const isProtagonistLine = text.speaker === null && text.body.startsWith('「')
  const name = text.speaker ?? (isProtagonistLine ? script.protagonist : null)

  return (
    <div className="wn-messagebox">
      {name && <div className="wn-speaker">{name}</div>}
      <div>{text.body.slice(0, state.view.visibleChars)}</div>
    </div>
  )
}
```

**ネームプレートの判定はここにしかない。** engine-spec の
「`「…」` は `@protagonist` の名前、記号なしの行はネームプレートを出さない」を実装している。
`「` は制御文字ではないので、行頭が `「` かどうかだけを見る。

- [x] **Step 5: `src/engine/ui/App.tsx` を書く**

```tsx
import { useState } from 'react'
import type { Runtime } from '../core/runtime.ts'
import { MessageBox } from './MessageBox.tsx'
import { Title } from './Title.tsx'
import { useEngine } from './useEngine.ts'

export function App({ runtime }: { runtime: Runtime }) {
  // 「タイトル画面か本編か」はエンジンの状態ではなく画面の状態なので useState でよい
  const [started, setStarted] = useState(false)
  const state = useEngine(runtime)

  const start = () => {
    setStarted(true)
    void runtime.start()
  }

  return (
    <div className="wn-viewport">
      <div className="wn-stage" onClick={() => started && runtime.advance()}>
        {started
          ? <MessageBox state={state} script={runtime.script} />
          : <Title title={runtime.script.title} onStart={start} />}
      </div>
    </div>
  )
}
```

- [x] **Step 6: `src/engine/ui/boot.tsx` と `src/engine/index.ts` を書く**

```tsx
// src/engine/ui/boot.tsx
import { createRoot } from 'react-dom/client'
import type { CompiledScript } from '../core/script.ts'
import { Runtime } from '../core/runtime.ts'
import { App } from './App.tsx'
import './style.css'

export type BootOptions = {
  mount: HTMLElement
  script: CompiledScript
  novelId: string
}

export function boot(opts: BootOptions): void {
  const runtime = new Runtime({
    script: opts.script,
    novelId: opts.novelId,
    // 素材のパス解決の基準。コアは DOM を触れないのでここで渡す
    baseUrl: document.baseURI,
  })
  createRoot(opts.mount).render(<App runtime={runtime} />)
}
```

```ts
// src/engine/index.ts
export { boot } from './ui/boot.tsx'
export type { BootOptions } from './ui/boot.tsx'
export type { CompiledScript } from './core/script.ts'
```

**`index.ts` から export するのはこれだけ。** ここが作品の触ってよい唯一の面であり、
増やすときは「作品側が本当に必要か」を必ず問う。

- [x] **Step 7: 実際に起動して確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

ブラウザで確認すること。

1. タイトル画面に「消えた一篇」が出る
2. 「はじめから」を押すと本文が出る
3. クリックで最後まで進む
4. `>ミカ` の行にネームプレート「ミカ」が出る
5. `「いちばん地味なやつ」` にネームプレート「ハル」が出る
6. 地の文にネームプレートが出ない
7. ウィンドウを縦長・横長にしても 16:9 が保たれ、レターボックスになる

- [x] **Step 8: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて PASS

- [x] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: タイトル画面と本編画面を追加し、台本が通しで読める状態にする"
```

---

### Task 8: 文字送り

**Files:**
- Create: `src/engine/core/settings.ts`
- Modify: `src/engine/core/runtime.ts`
- Test: `tests/core/typing.test.ts`

**Interfaces:**
- Consumes: `Runtime`（Task 6）
- Produces:
  - `type Settings = { textMode: 'sequential' | 'instant'; textSpeed: 'slow' | 'normal' | 'fast'; volume: {...} }`
  - `DEFAULT_SETTINGS: Settings`
  - `charDelayMs(settings: Settings, speed: 'slow' | 'normal'): number`
  - `runtime.setSettings(s: Settings): void`
  - `runtime.advance()` が文字送り中なら全文を即座に表示する

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/typing.test.ts
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, charDelayMs } from '../../src/engine/core/settings.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

const script: CompiledScript = {
  title: 't', protagonist: null, assets: {},
  scenes: [{ id: 'A', steps: [
    { t: 'text', i: 0, h: 'h0', speaker: null, body: 'あいうえお' },
    { t: 'text', i: 1, h: 'h1', speaker: null, body: 'かきくけこ' },
  ] }],
}

const make = (settings = DEFAULT_SETTINGS) => {
  const r = new Runtime({ script, novelId: 't', baseUrl: 'https://x.test/' })
  r.setSettings(settings)
  return r
}

describe('文字送りの速度', () => {
  it('基準は 40ms/文字', () => {
    expect(charDelayMs(DEFAULT_SETTINGS, 'normal')).toBe(40)
  })

  it('読者設定の速度が倍率として効く', () => {
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'slow' }, 'normal')).toBe(60)
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'fast' }, 'normal')).toBe(20)
  })

  it('@speed slow は読者設定に対する相対倍率として効く', () => {
    expect(charDelayMs(DEFAULT_SETTINGS, 'slow')).toBe(80)
    expect(charDelayMs({ ...DEFAULT_SETTINGS, textSpeed: 'fast' }, 'slow')).toBe(40)
  })

  it('一括表示のときは @speed を完全に無視して 0 になる', () => {
    const s = { ...DEFAULT_SETTINGS, textMode: 'instant' as const }
    expect(charDelayMs(s, 'slow')).toBe(0)
    expect(charDelayMs(s, 'normal')).toBe(0)
  })
})

describe('文字送りの進行', () => {
  it('逐次表示では visibleChars が 0 から増えていく', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textSpeed: 'fast' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('typing'))
    expect(r.getState().view.visibleChars).toBe(0)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
    expect(r.getState().view.visibleChars).toBe(5)
  })

  it('一括表示では最初から全文が見えている', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.visibleChars).toBe(5)
  })

  it('文字送り中のクリックは全文表示になり、次に進まない', async () => {
    const r = make({ ...DEFAULT_SETTINGS, textSpeed: 'slow' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('typing'))
    r.advance()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.visibleChars).toBe(5)
    expect(r.getState().view.currentText?.body).toBe('あいうえお')   // まだ1本文目
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/typing.test.ts`
Expected: FAIL（`core/settings.ts` が無い）

- [x] **Step 3: `src/engine/core/settings.ts` を書く**

```ts
export type Settings = {
  /** sequential 逐次表示 / instant 一括表示 */
  textMode: 'sequential' | 'instant'
  textSpeed: 'slow' | 'normal' | 'fast'
  volume: { master: number; bgm: number; se: number }
}

export const DEFAULT_SETTINGS: Settings = {
  textMode: 'sequential',
  textSpeed: 'normal',
  volume: { master: 0.8, bgm: 0.7, se: 0.9 },
}

/** 1文字あたりの待ち時間（ms）。基準 40ms に読者設定と @speed の倍率を掛ける */
const BASE_CHAR_MS = 40
const READER_RATE = { slow: 1.5, normal: 1.0, fast: 0.5 } as const
const SCRIPT_RATE = { slow: 2.0, normal: 1.0 } as const

export function charDelayMs(settings: Settings, scriptSpeed: 'slow' | 'normal'): number {
  // 一括表示を選ぶ読者は文字が流れること自体を避けたい。@speed は完全に無視する
  if (settings.textMode === 'instant') return 0
  return BASE_CHAR_MS * READER_RATE[settings.textSpeed] * SCRIPT_RATE[scriptSpeed]
}
```

- [x] **Step 4: `Runtime` に文字送りを足す**

`runtime.ts` に以下を加える。

import に足す:

```ts
import { DEFAULT_SETTINGS, charDelayMs, type Settings } from './settings.ts'
```

フィールドに足す:

```ts
  private settings: Settings = DEFAULT_SETTINGS
  /** 文字送りを打ち切って全文表示するためのフラグ */
  private skipTyping = false
```

メソッドを足す:

```ts
  setSettings(s: Settings): void {
    this.settings = s
  }

  getSettings(): Settings {
    return this.settings
  }

  /**
   * 1文字ずつ visibleChars を進める。
   * リプレイ中と一括表示のときは即座に全文表示になる。
   */
  private async type(body: string): Promise<void> {
    const delay = charDelayMs(this.settings, this.state.snapshot.speed)
    if (this.replaying || delay === 0) {
      this.state.view.visibleChars = body.length
      this.emit()
      return
    }

    this.state.view.phase = 'typing'
    this.state.view.visibleChars = 0
    this.skipTyping = false
    this.emit()

    for (let n = 1; n <= body.length; n++) {
      await sleep(delay)
      if (this.skipTyping) break
      this.state.view.visibleChars = n
      this.emit()
    }

    this.state.view.visibleChars = body.length
    this.emit()
  }
```

`execText` を差し替える:

```ts
  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    this.state.progress.index = step.i
    this.state.view.currentText = { speaker: step.speaker, body: step.body }
    this.state.view.visibleChars = 0
    this.emit()
    await this.type(step.body)
    await this.waitForClick()
  }
```

`advance()` を差し替える:

```ts
  advance(): void {
    // 文字送り中のクリックは、全文を表示して止める（次には進まない）
    if (this.state.view.phase === 'typing') {
      this.skipTyping = true
      return
    }
    if (this.state.view.phase !== 'waiting') return
    const resolve = this.clickResolve
    this.clickResolve = null
    resolve?.()
  }
```

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/core/`
Expected: PASS（全テスト）

Task 6 のテストのうち、一括表示を前提にしていたものが落ちる場合は
`r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })` を足して直す。

- [x] **Step 6: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

1. 文字が1文字ずつ出る
2. 表示途中でクリックすると全文が出て、そこで止まる
3. もう一度クリックすると次の本文に進む

- [x] **Step 7: コミット**

```bash
git add -A
git commit -m "feat: 文字送りと読者設定の速度を実装する"
```

---

## フェーズ4: 命令を1つずつ足す

ここからは**1タスクでパーサ・コア・UI を縦に貫く**。
各タスクの完了時点で、その命令が実際の台本で動いているところまで確認する。

### Task 9: `@bg` — 背景とクロスフェード

**Files:**
- Create: `src/engine/ui/Stage.tsx`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/App.tsx`, `src/engine/ui/style.css`
- Test: `tests/core/steps.test.ts`

**Interfaces:**
- Consumes: `Runtime.exec()`, `Runtime.perform()`（Task 6）、`resolveAsset()`
- Produces: `<Stage runtime state />`（背景・立ち絵・回想効果を描く唯一の場所）

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/steps.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

/** steps をそのまま持つ1シーンの台本を作る。末尾に本文を1つ足して止める */
export function scriptOf(steps: Step[]): CompiledScript {
  return {
    title: 't', protagonist: null, assets: {},
    scenes: [{ id: 'A', steps: [...steps, { t: 'text', i: 0, h: 'h', speaker: null, body: '.' }] }],
  }
}

export function runtimeOf(steps: Step[]) {
  const r = new Runtime({ script: scriptOf(steps), novelId: 't', baseUrl: 'https://x.test/' })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  return r
}

/** 最初のクリック待ちまで進める */
export async function runToWait(r: Runtime): Promise<void> {
  void r.start()
  await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 4000 })
}

describe('@bg', () => {
  it('snapshot.bg を更新する', async () => {
    const r = runtimeOf([{ t: 'bg', name: 'clubroom_day', fade: 0 }])
    await runToWait(r)
    expect(r.getState().snapshot.bg).toBe('clubroom_day')
  })

  it('fade の時間だけ performing で止まり、fadeMs が view に出る', async () => {
    const r = runtimeOf([{ t: 'bg', name: 'clubroom_day', fade: 300 }])
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('performing'))
    expect(r.getState().view.fadeMs).toBe(300)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
  })

  it('背景はシーンをまたいで持ち越される', async () => {
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/',
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [
          { id: 'A', steps: [{ t: 'bg', name: 'x', fade: 0 }, { t: 'text', i: 0, h: 'a', speaker: null, body: 'a' }] },
          { id: 'B', steps: [{ t: 'text', i: 0, h: 'b', speaker: null, body: 'b' }] },
        ],
      },
    })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    await runToWait(r)
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().snapshot.bg).toBe('x')   // シーンは状態をリセットしない
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: FAIL（`snapshot.bg` が null のまま）

- [x] **Step 3: `runtime.exec` に `bg` を足す**

`runtime.ts` の `exec` の `switch` に加える。

```ts
      case 'bg':
        this.state.snapshot.bg = step.name
        this.emit()
        await this.perform(step.fade)
        break
```

**状態を先に更新してから待つ。** UI は新しい背景を `fadeMs` 付きで描き始め、
コアはその時間だけ止まる。`transitionend` は見ない。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: PASS（3 tests）

- [x] **Step 5: `src/engine/ui/Stage.tsx` を書く**

```tsx
import { useRef } from 'react'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'

type Props = { runtime: Runtime; state: EngineState }

export function Stage({ runtime, state }: Props) {
  const bg = state.snapshot.bg
  const fadeMs = state.view.fadeMs

  // 直前の背景を覚えておき、下に敷いたままクロスフェードする。
  // レンダー中の ref 書き換えだが、bg が変わったときだけの冪等な操作なので二重レンダーでも壊れない。
  const shown = useRef<string | null>(bg)
  const under = useRef<string | null>(null)
  if (shown.current !== bg) {
    under.current = shown.current
    shown.current = bg
  }

  const url = (name: string | null) => {
    const href = name ? runtime.resolveAsset(`bg/${name}`) : null
    return href ? `url("${href}")` : undefined
  }

  return (
    <div className="wn-scene">
      {under.current && (
        <div className="wn-bg-layer" style={{ backgroundImage: url(under.current) }} />
      )}
      {bg && (
        <div
          key={bg}
          className="wn-bg-layer wn-bg-in"
          style={{ backgroundImage: url(bg), animationDuration: `${fadeMs}ms` }}
        />
      )}
    </div>
  )
}
```

`key={bg}` により背景が変わるたびにこの要素は作り直され、
CSS animation が必ず最初から走る。`fadeMs` が 0 なら一瞬で終わる。

**`transitionend` を待たない。** 完了の判定はコアの `perform()` が持っている。

- [x] **Step 6: `style.css` に背景のスタイルを足す**

```css
.wn-scene { position: absolute; inset: 0; }

.wn-bg-layer {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

@keyframes wn-fade-in { from { opacity: 0; } to { opacity: 1; } }
.wn-bg-in { animation-name: wn-fade-in; animation-timing-function: linear; animation-fill-mode: forwards; }
```

- [x] **Step 7: `App.tsx` に `Stage` を差し込む**

```tsx
        {started ? (
          <>
            <Stage runtime={runtime} state={state} />
            <MessageBox state={state} script={runtime.script} />
          </>
        ) : (
          <Title title={runtime.script.title} onStart={start} />
        )}
```

`import { Stage } from './Stage.tsx'` を足す。

- [x] **Step 8: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

1. 冒頭で `clubroom_day`（薄茶の板）が 600ms かけて出る
2. 「廊下」のシーンで `corridor_evening` に 800ms でクロスフェードする
3. 「引き」のシーンで `black` に 1500ms でフェードする
4. フェード中はクリックしても進まない

- [x] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: @bg の背景切替とクロスフェードを実装する"
```

---

### Task 10: `@show` / `@hide` — 立ち絵

**Files:**
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/Stage.tsx`, `src/engine/ui/style.css`
- Test: `tests/core/steps.test.ts`

**Interfaces:**
- Consumes: `Sprite`（`core/state.ts`）、`runtimeOf` / `runToWait`（Task 9 のテストヘルパ）
- Produces: `snapshot.sprites` が `@show` / `@hide` で更新される

> **申し送り（[2026-08-08 の決定](decisions/2026-08-08-asset-location-and-verification.md) 4）**
> `sprites` は**配列のまま `push` せず、必ず新しい配列で置き換える。**
> `emit()` は3層を浅くコピーするだけなので、配列を mutate すると参照が変わらず React が再描画しない。
> **`@show` の前後で `snapshot.sprites` の参照が変わることを assert するテストを1つ足すこと。**

- [x] **Step 1: 失敗するテストを書く**

```ts
describe('@show / @hide', () => {
  it('初出は既定値（normal / center）で表示される', async () => {
    const r = runtimeOf([{ t: 'show', id: 'mika', expr: null, pos: null }])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'normal', pos: 'center' }])
  })

  it('表情だけの変更は位置を維持する', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: 'normal', pos: 'left' },
      { t: 'show', id: 'mika', expr: 'smile', pos: null },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'left' }])
  })

  it('位置だけの変更は表情を維持する', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: 'smile', pos: 'center' },
      { t: 'show', id: 'mika', expr: null, pos: 'right' },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'right' }])
  })

  it('@hide は1人だけ消す', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: null, pos: 'left' },
      { t: 'show', id: 'tooru', expr: null, pos: 'right' },
      { t: 'hide', id: 'mika' },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites.map((s) => s.id)).toEqual(['tooru'])
  })

  it('@hide * は全員消す', async () => {
    const r = runtimeOf([
      { t: 'show', id: 'mika', expr: null, pos: 'left' },
      { t: 'show', id: 'tooru', expr: null, pos: 'right' },
      { t: 'hide', id: null },
    ])
    await runToWait(r)
    expect(r.getState().snapshot.sprites).toEqual([])
  })

  it('sprites 配列は毎回新しい参照になる（購読側が変化を検出できる）', async () => {
    const r = runtimeOf([{ t: 'show', id: 'mika', expr: null, pos: null }])
    const before = r.getState().snapshot.sprites
    await runToWait(r)
    expect(r.getState().snapshot.sprites).not.toBe(before)
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: FAIL（`sprites` が空のまま）

- [x] **Step 3: `runtime.exec` に `show` / `hide` を足す**

```ts
      case 'show': {
        const sprites = [...this.state.snapshot.sprites]
        const at = sprites.findIndex((s) => s.id === step.id)
        if (at < 0) {
          // 初出。省略された項目は既定値
          sprites.push({ id: step.id, expr: step.expr ?? 'normal', pos: step.pos ?? 'center' })
        } else {
          // 既出。省略された項目は現在値を維持する
          sprites[at] = {
            id: step.id,
            expr: step.expr ?? sprites[at].expr,
            pos: step.pos ?? sprites[at].pos,
          }
        }
        this.state.snapshot.sprites = sprites
        this.emit()
        break
      }

      case 'hide':
        this.state.snapshot.sprites =
          step.id === null ? [] : this.state.snapshot.sprites.filter((s) => s.id !== step.id)
        this.emit()
        break
```

**配列を mutate しない。** `emit()` は3層を浅くコピーするだけなので、
配列の中身を書き換えると購読側から見て変化しない。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: PASS

- [x] **Step 5: `Stage.tsx` に立ち絵を足す**

`Stage` の戻り値の `.wn-scene` の中、背景レイヤーの後ろに加える。

```tsx
      {state.snapshot.sprites.map((sprite) => {
        const href = runtime.resolveAsset(`chara/${sprite.id}_${sprite.expr}`)
        if (!href) {
          // 表情を省略した @show はビルド時に検査できないため、ここで初めて欠落が分かる
          console.warn(`立ち絵が見つからない: chara/${sprite.id}_${sprite.expr}`)
          return null
        }
        return (
          <img
            key={sprite.id}
            className={`wn-sprite wn-sprite-${sprite.pos}`}
            src={href}
            alt=""
          />
        )
      })}
```

- [x] **Step 6: `style.css` に立ち絵のスタイルを足す**

```css
.wn-sprite {
  position: absolute;
  bottom: 0;
  height: 88cqh;
  width: auto;
  transition: left 400ms ease, opacity 300ms linear;
  transform: translateX(-50%);
}
.wn-sprite-left   { left: 24%; }
.wn-sprite-center { left: 50%; }
.wn-sprite-right  { left: 76%; }
```

位置の移動だけは CSS の `transition` に任せる。**これは演出の完了判定に使っていない**ため
「時間の権威はコア」という原則に反しない。`@show` に待ち時間の指定がなく、
コアは位置変更で `perform()` を呼ばずに次へ進む。

- [x] **Step 7: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

1. `@show mika normal pos:center` でミカが中央に出る
2. `@show mika smile` で表情だけ変わる（位置はそのまま）
3. トオル登場時にミカが左へ滑らかに移動する
4. 「廊下」の `@hide *` で全員消える
5. 「回想・昨日の部室」で再びミカが出る

- [x] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: @show / @hide の立ち絵表示を実装する"
```

---

### Task 11: `@wait` / `@speed` / `@flashback`

**Files:**
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/Stage.tsx`, `src/engine/ui/style.css`
- Test: `tests/core/steps.test.ts`

**Interfaces:**
- Consumes: `Runtime.perform()`、`charDelayMs()`（Task 8）
- Produces: `snapshot.speed` / `snapshot.flashback` が更新され、`@wait` が待ちを消費する
- Produces: `advance()` が `phase === 'performing'` のとき、進行中の待ちを打ち切る

> **申し送り（[2026-08-08 の決定](decisions/2026-08-08-asset-location-and-verification.md) 2）**
> engine-spec に**演出中のクリック**の規定が入った。**現在の待ちだけを打ち切る**（連打で連続スキップ）。
> `perform()` の `sleep` を中断可能にし、`advance()` の `phase === 'typing'` 分岐の隣に
> `performing` の分岐を足す。次の本文ブロックには進めないこと。
> テストは「`@wait 5000` の最中に `advance()` すると即座に次へ進む」で固定する。

- [x] **Step 1: 失敗するテストを書く**

```ts
describe('@wait / @speed / @flashback', () => {
  it('@wait は performing で指定時間だけ止まる', async () => {
    const r = runtimeOf([{ t: 'wait', ms: 200 }])
    const started = Date.now()
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('performing'))
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 2000 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(180)
  })

  it('@speed は snapshot に入り、シーンをまたいで持続する', async () => {
    const r = runtimeOf([{ t: 'speed', value: 'slow' }])
    await runToWait(r)
    expect(r.getState().snapshot.speed).toBe('slow')
  })

  it('@flashback on / off が snapshot に入る', async () => {
    const on = runtimeOf([{ t: 'flashback', on: true }])
    await runToWait(on)
    expect(on.getState().snapshot.flashback).toBe(true)

    const off = runtimeOf([{ t: 'flashback', on: true }, { t: 'flashback', on: false }])
    await runToWait(off)
    expect(off.getState().snapshot.flashback).toBe(false)
  })

  it('@speed slow の区間は文字送りが遅くなる', async () => {
    const r = new Runtime({
      novelId: 't', baseUrl: 'https://x.test/',
      script: {
        title: 't', protagonist: null, assets: {},
        scenes: [{ id: 'A', steps: [
          { t: 'speed', value: 'slow' },
          { t: 'text', i: 0, h: 'h', speaker: null, body: 'あいう' },
        ] }],
      },
    })
    r.setSettings({ textMode: 'sequential', textSpeed: 'fast', volume: { master: 1, bgm: 1, se: 1 } })
    const started = Date.now()
    await runToWait(r)
    // fast(0.5) × slow(2.0) × 40ms = 40ms/文字 × 3文字
    expect(Date.now() - started).toBeGreaterThanOrEqual(100)
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: FAIL

- [x] **Step 3: `runtime.exec` に3命令を足す**

ファイル冒頭に定数を置く。

```ts
/** @flashback の切替にかける時間。台本に引数がないのでエンジン側の定数 */
const FLASHBACK_FADE_MS = 600
```

`switch` に加える。

```ts
      case 'wait':
        await this.perform(step.ms)
        break

      case 'speed':
        this.state.snapshot.speed = step.value
        this.emit()
        break

      case 'flashback':
        this.state.snapshot.flashback = step.on
        this.emit()
        await this.perform(FLASHBACK_FADE_MS)
        break
```

`@speed` は瞬時に効くので `perform()` を呼ばない。
`@flashback` は画面効果の切替なので、その分だけ止める。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/steps.test.ts`
Expected: PASS

- [x] **Step 5: `Stage.tsx` に回想の画面効果を足す**

`.wn-scene` の className を状態で切り替える。

```tsx
    <div className={`wn-scene${state.snapshot.flashback ? ' wn-flashback' : ''}`}>
```

そして背景・立ち絵の後ろにオーバーレイを1枚足す。

```tsx
      <div className="wn-flashback-veil" />
```

- [x] **Step 6: `style.css` に回想のスタイルを足す**

```css
.wn-scene { transition: filter 600ms linear; }
.wn-flashback { filter: sepia(0.55) contrast(0.92) brightness(0.92); }

.wn-flashback-veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, rgba(255, 236, 190, 0) 45%, rgba(120, 90, 40, 0.45) 100%);
  opacity: 0;
  transition: opacity 600ms linear;
}
.wn-flashback .wn-flashback-veil { opacity: 1; }
```

CSS 側の 600ms は `FLASHBACK_FADE_MS` と同じ値。
**片方だけ変えると演出とコアの待ち時間がずれる**ので、変えるときは両方直す。

- [x] **Step 7: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

1. 「部室・違和感」の `@speed slow` の2行だけ文字送りが遅い
2. `@speed normal` で元に戻る
3. トオル登場前の `@wait 300` で一拍空く
4. 「回想・昨日の部室」で画面がセピアになり、`@flashback off` で戻る

- [x] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: @wait / @speed / @flashback を実装する"
```

---

### Task 12: `@bgm` / `@se` — Web Audio

**Files:**
- Create: `src/engine/core/audio.ts`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/App.tsx`, `src/engine/ui/Title.tsx`
- Test: `tests/core/audio.test.ts`

**Interfaces:**
- Consumes: `Runtime`、`Settings.volume`（Task 8）
- Produces:
  - `interface AudioPort { unlock(); syncBgm(name, fadeMs?); playSe(name); setVolumes(v); resumeIfSuspended() }`
  - `class WebAudio implements AudioPort`
  - `RuntimeOptions.audio?: AudioPort`（省略時は何もしない `nullAudio`）
  - `runtime.unlockAudio(): void`

**`<audio>` 要素は使わない。** iOS Safari が `HTMLMediaElement.volume` を無視するため、
`@bgm stop fade:800` が実装できない。GainNode なら確実にフェードできる。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/audio.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { AudioPort } from '../../src/engine/core/audio.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

function spyAudio() {
  return {
    calls: [] as string[],
    unlock() { this.calls.push('unlock') },
    syncBgm(name: string | null, fadeMs = 0) { this.calls.push(`bgm:${name}:${fadeMs}`) },
    playSe(name: string) { this.calls.push(`se:${name}`) },
    setVolumes() {},
    resumeIfSuspended() {},
  } satisfies AudioPort & { calls: string[] }
}

function run(steps: Step[], audio: AudioPort) {
  const script: CompiledScript = {
    title: 't', protagonist: null, assets: {},
    scenes: [{ id: 'A', steps: [...steps, { t: 'text', i: 0, h: 'h', speaker: null, body: '.' }] }],
  }
  const r = new Runtime({ script, novelId: 't', baseUrl: 'https://x.test/', audio })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  void r.start()
  return r
}

describe('@bgm の意味論', () => {
  it('同じ名前の @bgm が再度来ても鳴らし直さない', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgm', name: 'daily' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0'])
  })

  it('別の名前が来たら差し替える', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgm', name: 'tension' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0', 'bgm:tension:0'])
  })

  it('@bgm stop は fade 付きで null にする', async () => {
    const a = spyAudio()
    const r = run([{ t: 'bgm', name: 'daily' }, { t: 'bgmStop', fade: 1200 }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['bgm:daily:0', 'bgm:null:1200'])
    expect(r.getState().snapshot.bgm).toBeNull()
  })

  it('@se は同名でも毎回鳴る', async () => {
    const a = spyAudio()
    const r = run([{ t: 'se', name: 'paper' }, { t: 'se', name: 'paper' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(a.calls).toEqual(['se:paper', 'se:paper'])
  })

  it('@se は状態を持たない（snapshot に現れない）', async () => {
    const a = spyAudio()
    const r = run([{ t: 'se', name: 'paper' }], a)
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(Object.values(r.getState().snapshot)).not.toContain('paper')
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/audio.test.ts`
Expected: FAIL（`core/audio.ts` が無い）

- [x] **Step 3: `src/engine/core/audio.ts` を書く**

```ts
export type Volumes = { master: number; bgm: number; se: number }

export interface AudioPort {
  /** ユーザージェスチャの中から同期的に呼ぶこと */
  unlock(): void
  /** 鳴らすべき BGM を指定する。今鳴っているものと同じなら何もしない */
  syncBgm(name: string | null, fadeMs?: number): void
  playSe(name: string): void
  setVolumes(v: Volumes): void
  resumeIfSuspended(): void
}

/** テストと、音を持たない環境のための何もしない実装 */
export const nullAudio: AudioPort = {
  unlock() {},
  syncBgm() {},
  playSe() {},
  setVolumes() {},
  resumeIfSuspended() {},
}

type Resolve = (key: string) => string | null

/** フェードアウト専用の GainNode を持たせた BGM の再生ノード */
type BgmSource = AudioBufferSourceNode & { fadeGain: GainNode }

export class WebAudio implements AudioPort {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private bgmGain: GainNode | null = null
  private seGain: GainNode | null = null
  private buffers = new Map<string, AudioBuffer>()
  private bgmSource: BgmSource | null = null
  private current: string | null = null
  private volumes: Volumes = { master: 0.8, bgm: 0.7, se: 0.9 }

  constructor(private readonly resolve: Resolve) {}

  /**
   * AudioContext は suspended で生成されるため、ユーザージェスチャの中で resume する。
   * await を1つでも挟むとジェスチャの資格が切れるので、この関数は同期でなければならない。
   */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    const master = ctx.createGain()
    const bgm = ctx.createGain()
    const se = ctx.createGain()
    bgm.connect(master)
    se.connect(master)
    master.connect(ctx.destination)

    this.ctx = ctx
    this.master = master
    this.bgmGain = bgm
    this.seGain = se
    this.applyVolumes()

    void ctx.resume()

    // 無音バッファを1回鳴らして、iOS で確実に解禁する
    const silent = ctx.createBufferSource()
    silent.buffer = ctx.createBuffer(1, 1, 22050)
    silent.connect(ctx.destination)
    silent.start(0)
  }

  setVolumes(v: Volumes): void {
    this.volumes = v
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.bgmGain || !this.seGain) return
    const now = this.ctx.currentTime
    this.master.gain.setValueAtTime(this.volumes.master, now)
    this.bgmGain.gain.setValueAtTime(this.volumes.bgm, now)
    this.seGain.gain.setValueAtTime(this.volumes.se, now)
  }

  /** タブ復帰や画面ロック明けに suspended へ落ちるので、両方の経路から呼ぶ */
  resumeIfSuspended(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  syncBgm(name: string | null, fadeMs = 0): void {
    if (name === this.current) return
    this.current = name
    this.stopBgm(fadeMs)
    if (name) void this.startBgm(name)
  }

  private stopBgm(fadeMs: number): void {
    const src = this.bgmSource
    const ctx = this.ctx
    if (!src || !ctx) return
    this.bgmSource = null

    if (fadeMs <= 0) {
      src.stop()
      return
    }
    // 音量設定用の bgmGain を落とすと設定そのものが壊れるので、
    // source ごとに持たせたフェード専用の GainNode を下げる
    const now = ctx.currentTime
    const gain = src.fadeGain.gain
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + fadeMs / 1000)
    src.stop(now + fadeMs / 1000)
  }

  private async startBgm(name: string): Promise<void> {
    if (!this.ctx || !this.bgmGain) return
    const buffer = await this.load(`bgm/${name}`)
    // ロードを待っている間に別の曲へ切り替わっていたら、この再生は捨てる
    const ctx = this.ctx
    if (!buffer || !ctx || !this.bgmGain || this.current !== name) return

    const fade = ctx.createGain()
    fade.gain.setValueAtTime(1, ctx.currentTime)
    fade.connect(this.bgmGain)

    const src = ctx.createBufferSource() as BgmSource
    src.buffer = buffer
    src.loop = true
    src.fadeGain = fade
    src.connect(fade)
    src.start()
    this.bgmSource = src
  }

  playSe(name: string): void {
    const ctx = this.ctx
    if (!ctx || !this.seGain) return
    void this.load(`se/${name}`).then((buffer) => {
      if (!buffer || !this.ctx || !this.seGain) return
      const src = this.ctx.createBufferSource()
      src.buffer = buffer
      src.connect(this.seGain)
      src.start()
    })
  }

  private async load(key: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(key)
    if (cached) return cached
    const url = this.resolve(key)
    const ctx = this.ctx
    if (!url || !ctx) return null
    try {
      const res = await fetch(url)
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer())
      this.buffers.set(key, buffer)
      return buffer
    } catch (e) {
      console.warn(`音声の読み込みに失敗した: ${key}`, e)
      return null
    }
  }
}
```

**実装の順序が制約されている。** `unlock()` は素材のロードを待てないため、
「resume してから素材をロード」の順になる。`startBgm` が `await` の後に
`this.current !== name` を確かめているのはそのため。

- [x] **Step 4: `Runtime` に音声を接続する**

`RuntimeOptions` に足す。

```ts
  audio?: AudioPort
```

コンストラクタで受ける。

```ts
  protected readonly audio: AudioPort
  // constructor 内
  this.audio = opts.audio ?? nullAudio
```

`exec` の `switch` に加える。

```ts
      case 'bgm':
        // 同名の再指定では鳴らし直さない。曲頭に戻すとシーンをまたぐ持ち越しと噛み合わない
        if (this.state.snapshot.bgm !== step.name) {
          this.state.snapshot.bgm = step.name
          this.emit()
          if (!this.replaying) this.audio.syncBgm(step.name, 0)
        }
        break

      case 'bgmStop':
        if (this.state.snapshot.bgm !== null) {
          this.state.snapshot.bgm = null
          this.emit()
          if (!this.replaying) this.audio.syncBgm(null, step.fade)
        }
        break

      case 'se':
        // SE は状態ではなく発火。snapshot に入らず、リプレイ中は鳴らさない
        if (!this.replaying) this.audio.playSe(step.name)
        break
```

公開メソッドを足す。

```ts
  /** タイトル画面のボタンハンドラから同期的に呼ぶこと */
  unlockAudio(): void {
    this.audio.unlock()
    this.audio.setVolumes(this.settings.volume)
  }

  resumeAudio(): void {
    this.audio.resumeIfSuspended()
  }
```

`setSettings` を差し替えて音量を反映する。

```ts
  setSettings(s: Settings): void {
    this.settings = s
    this.audio.setVolumes(s.volume)
  }
```

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/core/audio.test.ts`
Expected: PASS（5 tests）

- [x] **Step 6: `boot.tsx` で `WebAudio` を注入する**

`WebAudio` は `Runtime` のコンストラクタ引数なので、`runtime.resolveAsset` を
そのまま渡すことはできない（その時点で `Runtime` はまだ存在しない）。
`assets` から直接引く関数を作って渡し、循環を避ける。

```tsx
import { WebAudio } from '../core/audio.ts'

export function boot(opts: BootOptions): void {
  const baseUrl = document.baseURI
  const resolve = (key: string): string | null => {
    const rel = opts.script.assets[key]
    return rel ? new URL(rel, baseUrl).href : null
  }
  const runtime = new Runtime({
    script: opts.script,
    novelId: opts.novelId,
    baseUrl,
    audio: new WebAudio(resolve),
  })
  createRoot(opts.mount).render(<App runtime={runtime} />)
}
```

- [x] **Step 7: `App.tsx` で unlock とバックグラウンド復帰を繋ぐ**

```tsx
  const start = () => {
    // await を挟まず同期的に呼ぶ。挟むとユーザージェスチャの資格が切れる
    runtime.unlockAudio()
    setStarted(true)
    void runtime.start()
  }

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') runtime.resumeAudio() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [runtime])
```

ステージのクリックハンドラでも復帰を試みる（二段構え）。

```tsx
      <div className="wn-stage" onClick={() => { runtime.resumeAudio(); if (started) runtime.advance() }}>
```

`resume()` は冪等なので、両方走っても害はない。

- [x] **Step 8: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

1. 「はじめから」を押すと `daily`（392Hz のトーン）がループで鳴る
2. 「部室・違和感」の `@bgm stop fade:1200` で滑らかに消える
3. `@bgm tension` で別の音程に変わる
4. ドアの `@se door_open` が鳴り、BGM は止まらない
5. タブを切り替えて戻すと音が戻る
6. `@bgm daily` が2回続く箇所で曲が頭出しされない

可能なら iOS Safari でも確認する（タイトル画面を経由すれば鳴ること）。

- [x] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: Web Audio による @bgm / @se と音声の解禁を実装する"
```

---

## フェーズ5: 既読・バックログ・セーブ

### Task 13: ストレージと既読

**Files:**
- Create: `src/engine/core/storage.ts`, `src/engine/core/read.ts`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/boot.tsx`
- Test: `tests/core/read.test.ts`

**Interfaces:**
- Consumes: `Settings`（Task 8）
- Produces:
  - `interface Storage { get(key); set(key, value); remove(key) }`
  - `memoryStorage(): Storage`, `browserStorage(): Storage`
  - `systemKey(novelId)`, `saveKey(novelId, slot)`
  - `type SystemData = { read: string[]; settings: Settings }`
  - `class SystemStore { load(): SystemData; save(d: SystemData): void }`
  - `class ReadSet { add(h); has(h); size; toArray(); takeDirty() }`
  - `runtime.isRead(h): boolean`, `runtime.flushSystem(): void`

**既読はセーブと完全に独立している。** セーブせずにブラウザを閉じても既読は残る。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/read.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import { SystemStore, memoryStorage, systemKey } from '../../src/engine/core/storage.ts'
import { ReadSet } from '../../src/engine/core/read.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

const script: CompiledScript = {
  title: 't', protagonist: null, assets: {},
  scenes: [{ id: 'A', steps: [
    { t: 'text', i: 0, h: 'aaa', speaker: null, body: '一' },
    { t: 'text', i: 1, h: 'bbb', speaker: null, body: '二' },
  ] }],
}

describe('ReadSet', () => {
  it('追加した分だけ dirty になり、takeDirty で1度だけ取れる', () => {
    const r = new ReadSet(['x'])
    expect(r.takeDirty()).toBeNull()
    r.add('y')
    expect(r.takeDirty()).toEqual(['x', 'y'])
    expect(r.takeDirty()).toBeNull()
  })

  it('同じハッシュを2回足しても dirty にならない', () => {
    const r = new ReadSet(['x'])
    r.add('x')
    expect(r.takeDirty()).toBeNull()
  })
})

describe('既読の記録', () => {
  it('本文を表示した瞬間に記録される（セーブ操作と無関係）', async () => {
    const storage = memoryStorage()
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.isRead('aaa')).toBe(true)
    expect(r.isRead('bbb')).toBe(false)
  })

  it('flushSystem でストレージに書き出される', async () => {
    const storage = memoryStorage()
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    r.flushSystem()
    expect(JSON.parse(storage.get(systemKey('n'))!).read).toEqual(['aaa'])
  })

  it('既読は起動時に復元される', async () => {
    const storage = memoryStorage()
    new SystemStore(storage, 'n').save({ read: ['aaa'], settings: DEFAULT_SETTINGS })
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/', storage })
    expect(r.isRead('aaa')).toBe(true)
  })

  it('壊れたシステムデータは既定値にフォールバックする', () => {
    const storage = memoryStorage()
    storage.set(systemKey('n'), '{壊れている')
    expect(new SystemStore(storage, 'n').load()).toEqual({ read: [], settings: DEFAULT_SETTINGS })
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/read.test.ts`
Expected: FAIL（モジュールが無い）

- [x] **Step 3: `src/engine/core/storage.ts` を書く**

```ts
import { DEFAULT_SETTINGS, type Settings } from './settings.ts'

/**
 * 差し替え可能なストレージ。localStorage → IndexedDB の移行のためでもあるが、
 * テストでインメモリ実装を差せることのほうが日常的に効く。
 */
export interface Storage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v) },
    remove: (k) => { map.delete(k) },
  }
}

/** localStorage 実装。UI 層から注入する（core は window を知らない） */
export function browserStorage(): Storage {
  return {
    get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) { console.warn('保存に失敗した', e) } },
    remove: (k) => { try { localStorage.removeItem(k) } catch { /* 無視 */ } },
  }
}

export const systemKey = (novelId: string): string => `wn:${novelId}:system`
export const saveKey = (novelId: string, slot: string): string => `wn:${novelId}:save:${slot}`

/**
 * システムデータ。作品ごとに単一で、全セーブスロットに共通。
 * セーブスロットを削除しても既読が消えないのはこの分離による。
 */
export type SystemData = {
  read: string[]
  settings: Settings
}

export class SystemStore {
  constructor(private readonly storage: Storage, private readonly novelId: string) {}

  load(): SystemData {
    const raw = this.storage.get(systemKey(this.novelId))
    if (!raw) return { read: [], settings: DEFAULT_SETTINGS }
    try {
      const data = JSON.parse(raw) as Partial<SystemData>
      return {
        read: Array.isArray(data.read) ? data.read.filter((h) => typeof h === 'string') : [],
        // 設定は「既定値にセーブ値を上書きマージ」。項目を足しても旧データが壊れない
        settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
      }
    } catch {
      console.warn('システムデータが壊れているため既定値で起動する')
      return { read: [], settings: DEFAULT_SETTINGS }
    }
  }

  save(data: SystemData): void {
    this.storage.set(systemKey(this.novelId), JSON.stringify(data))
  }
}
```

- [x] **Step 4: `src/engine/core/read.ts` を書く**

```ts
/**
 * 既読の本文ハッシュ。シーンも位置も参照しない。
 * ハッシュはビルド時に計算済みで、実行時に計算する処理はどこにもない。
 */
export class ReadSet {
  private readonly hashes: Set<string>
  private dirty = false

  constructor(initial: readonly string[] = []) {
    this.hashes = new Set(initial)
  }

  add(hash: string): void {
    if (this.hashes.has(hash)) return
    this.hashes.add(hash)
    this.dirty = true
  }

  has(hash: string): boolean {
    return this.hashes.has(hash)
  }

  get size(): number {
    return this.hashes.size
  }

  toArray(): string[] {
    return [...this.hashes]
  }

  /** 前回の書き出し以降に追加があれば全件を返す。無ければ null */
  takeDirty(): string[] | null {
    if (!this.dirty) return null
    this.dirty = false
    return this.toArray()
  }
}
```

- [x] **Step 5: `Runtime` に既読を組み込む**

`RuntimeOptions` に足す。

```ts
  storage?: Storage
```

コンストラクタで組み立てる。

```ts
  protected readonly storage: Storage
  protected readonly system: SystemStore
  protected readonly read: ReadSet
  // constructor 内（settings の初期化より前に置く）
  // storage は1つだけ作ってフィールドに持つ。opts.storage ?? memoryStorage() を
  // 複数箇所で書くと別インスタンスになり、セーブとシステムデータが別の入れ物に入る
  this.storage = opts.storage ?? memoryStorage()
  this.system = new SystemStore(this.storage, opts.novelId)
  const data = this.system.load()
  this.read = new ReadSet(data.read)
  this.settings = data.settings
```

`settings` のフィールド宣言から初期値 `= DEFAULT_SETTINGS` を外し、`private settings: Settings` にする。

メソッドを足す。

```ts
  isRead(hash: string): boolean {
    return this.read.has(hash)
  }

  /** 既読と設定をストレージへ書き出す。変更が無ければ何もしない */
  flushSystem(): void {
    const read = this.read.takeDirty()
    if (!read) return
    this.system.save({ read, settings: this.settings })
  }
```

`setSettings` は設定変更を即座に永続化する。

```ts
  setSettings(s: Settings): void {
    this.settings = s
    this.audio.setVolumes(s.volume)
    this.system.save({ read: this.read.toArray(), settings: s })
    this.emit()
  }
```

`execText` の先頭で既読を記録する。

```ts
    // セーブ操作とは無関係に、本文を表示した瞬間に記録する
    this.read.add(step.h)
```

- [x] **Step 6: テストが通ることを確認する**

Run: `npx vitest run tests/core/`
Expected: PASS

- [x] **Step 7: `boot.tsx` で localStorage と定期書き出しを繋ぐ**

`Runtime` の生成に `storage: browserStorage()` を足し、書き出しの契機を用意する。

```ts
  // 数秒おきと pagehide でまとめて書き出す。1文字ごとに localStorage を触らない
  const timer = setInterval(() => runtime.flushSystem(), 5000)
  addEventListener('pagehide', () => {
    clearInterval(timer)
    runtime.flushSystem()
  })
```

- [x] **Step 8: 実機で確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

DevTools の Application → Local Storage で `wn:kieta-ippen:system` を見る。

1. 読み進めると `read` の配列が伸びる
2. リロードしても消えない
3. タブを閉じる直前の分まで入っている

- [x] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: 差し替え可能なストレージと既読の記録を実装する"
```

---

### Task 14: バックログ

**Files:**
- Create: `src/engine/core/backlog.ts`, `src/engine/ui/Backlog.tsx`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/App.tsx`, `src/engine/ui/style.css`
- Test: `tests/core/backlog.test.ts`

**Interfaces:**
- Consumes: `BacklogEntry`（`core/state.ts`）
- Produces:
  - `BACKLOG_LIMIT = 200`
  - `class Backlog { push(e); entries(); clear() }`
  - `runtime.canOpenUi(): boolean`（クリック待ちの瞬間だけ true）

> **申し送り（[2026-08-08 の決定](decisions/2026-08-08-asset-location-and-verification.md) 4）**
> `view.backlog` は**配列のまま `push` せず、必ず新しい配列で置き換える。**
> `emit()` は3層を浅くコピーするだけなので、配列を mutate すると参照が変わらず React が再描画しない。
> **本文を1つ表示したあと `view.backlog` の参照が変わることを assert するテストを1つ足すこと。**

**バックログはスナップショットに入らない**（不変条件4の唯一の例外）。
画面の見た目を決めないため、含めなくても復元後の画面は完全に一致する。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/backlog.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BACKLOG_LIMIT, Backlog } from '../../src/engine/core/backlog.ts'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import type { CompiledScript } from '../../src/engine/core/script.ts'

describe('リングバッファ', () => {
  it('上限は 200', () => {
    expect(BACKLOG_LIMIT).toBe(200)
  })

  it('上限を超えると古いものから捨てる', () => {
    const b = new Backlog()
    for (let i = 0; i < BACKLOG_LIMIT + 5; i++) b.push({ speaker: null, body: `${i}` })
    expect(b.entries()).toHaveLength(BACKLOG_LIMIT)
    expect(b.entries()[0].body).toBe('5')
    expect(b.entries().at(-1)!.body).toBe(`${BACKLOG_LIMIT + 4}`)
  })

  it('entries は毎回新しい参照を返す', () => {
    const b = new Backlog()
    const before = b.entries()
    b.push({ speaker: null, body: 'x' })
    expect(b.entries()).not.toBe(before)
  })
})

describe('積むタイミング', () => {
  const script: CompiledScript = {
    title: 't', protagonist: null, assets: {},
    scenes: [
      { id: 'A', steps: [{ t: 'text', i: 0, h: 'a', speaker: 'ミカ', body: '一' }] },
      { id: 'B', steps: [{ t: 'text', i: 0, h: 'b', speaker: null, body: '二' }] },
    ],
  }

  it('本文を表示した瞬間に積まれ、シーン境界でクリアされない', async () => {
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/' })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.getState().view.backlog).toEqual([{ speaker: 'ミカ', body: '一' }])
    r.advance()
    await vi.waitFor(() => expect(r.getState().progress.scene).toBe('B'))
    expect(r.getState().view.backlog).toEqual([
      { speaker: 'ミカ', body: '一' },
      { speaker: null, body: '二' },
    ])
  })

  it('クリック待ちのときだけ UI を開ける', async () => {
    const r = new Runtime({ script, novelId: 'n', baseUrl: 'https://x.test/' })
    r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    expect(r.canOpenUi()).toBe(false)
    void r.start()
    await vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'))
    expect(r.canOpenUi()).toBe(true)
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/backlog.test.ts`
Expected: FAIL

- [x] **Step 3: `src/engine/core/backlog.ts` を書く**

```ts
import type { BacklogEntry } from './state.ts'

/** 保持件数。実際に読んで足りなければ増やす */
export const BACKLOG_LIMIT = 200

export class Backlog {
  private items: BacklogEntry[] = []

  push(entry: BacklogEntry): void {
    const next = [...this.items, entry]
    this.items = next.length > BACKLOG_LIMIT ? next.slice(next.length - BACKLOG_LIMIT) : next
  }

  entries(): BacklogEntry[] {
    return this.items
  }

  clear(): void {
    this.items = []
  }
}
```

毎回新しい配列を作る。200件のコピーは無視できるコストで、
購読側が参照の変化で更新を検出できるほうが価値が高い。

- [x] **Step 4: `Runtime` にバックログを組み込む**

フィールドを足す。

```ts
  protected readonly backlog = new Backlog()
```

`execText` の既読記録の隣に並べる。

```ts
    this.read.add(step.h)
    this.backlog.push({ speaker: step.speaker, body: step.body })
    this.state.view.backlog = this.backlog.entries()
```

メソッドを足す。

```ts
  /** バックログ・セーブ UI を開いてよいか。セーブ可能点とまったく同じ条件 */
  canOpenUi(): boolean {
    return this.state.view.phase === 'waiting'
  }
```

**シーン境界でクリアしない。** `enterScene` に手を入れないこと。

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/core/backlog.test.ts`
Expected: PASS（5 tests）

- [x] **Step 6: `src/engine/ui/Backlog.tsx` を書く**

```tsx
import type { CompiledScript } from '../core/script.ts'
import type { BacklogEntry } from '../core/state.ts'

type Props = {
  entries: readonly BacklogEntry[]
  script: CompiledScript
  onClose: () => void
}

export function Backlog({ entries, script, onClose }: Props) {
  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>バックログ</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>
        <div className="wn-backlog-list">
          {entries.map((entry, n) => {
            const isProtagonist = entry.speaker === null && entry.body.startsWith('「')
            const name = entry.speaker ?? (isProtagonist ? script.protagonist : null)
            return (
              <p key={n} className="wn-backlog-item">
                {name && <span className="wn-backlog-name">{name}</span>}
                {entry.body}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

**読み返しのみ。進行位置は動かさない**（クリックしてもジャンプしない）。

- [x] **Step 7: `style.css` にオーバーレイのスタイルを足す**

```css
.wn-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.72);
  z-index: 10;
}
.wn-panel {
  width: 80cqw;
  max-height: 82cqh;
  display: flex;
  flex-direction: column;
  gap: 2cqw;
  padding: 3cqw;
  background: #141821;
  border-radius: 1cqw;
  font-size: 2.2cqw;
}
.wn-panel-head { display: flex; justify-content: space-between; align-items: center; }
.wn-backlog-list { overflow-y: auto; line-height: 1.8; }
.wn-backlog-item { margin: 0 0 1.4cqw; }
.wn-backlog-name { display: inline-block; margin-right: 1cqw; opacity: 0.7; }
```

- [x] **Step 8: `App.tsx` にバックログを開く導線を足す**

画面右上にボタンを置く。

```tsx
  const [ui, setUi] = useState<'none' | 'backlog'>('none')

  // ...ステージの中、MessageBox の後ろ
  {started && ui === 'none' && runtime.canOpenUi() && (
    <button
      className="wn-button wn-corner"
      onClick={(e) => { e.stopPropagation(); setUi('backlog') }}
    >
      履歴
    </button>
  )}
  {ui === 'backlog' && (
    <Backlog entries={state.view.backlog} script={runtime.script} onClose={() => setUi('none')} />
  )}
```

```css
.wn-corner { position: absolute; top: 2cqw; right: 2cqw; font-size: 1.8cqw; padding: 0.8cqw 2cqw; }
```

`runtime.canOpenUi()` でボタン自体を出し分けるため、**演出中・文字送り中は開けない**。

- [x] **Step 9: 実機で確認する**

1. クリック待ちのときだけ「履歴」ボタンが出る
2. 押すと表示済みの本文が並ぶ
3. シーンをまたいでも遡れる
4. 閉じると元の位置のまま続きから読める

- [x] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: 読み返し専用のバックログを実装する"
```

---

### Task 15: セーブ・ロード・リプレイ

**Files:**
- Create: `src/engine/core/save.ts`, `src/engine/ui/SaveMenu.tsx`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/App.tsx`, `src/engine/ui/Title.tsx`
- Test: `tests/core/save.test.ts`

**Interfaces:**
- Consumes: `Snapshot`（`core/state.ts`）、`saveKey`（`core/storage.ts`）、`Backlog`（Task 14）
- Produces:
  - `type SaveData = { scene: string; snapshot: Snapshot; index: number }`
  - `type SaveMeta = { slot: string; scene: string; index: number; savedAt: number; preview: string }`
  - `class LoadError extends Error`
  - `parseSave(raw: string): SaveData | null`
  - `runtime.makeSave(): SaveData`, `runtime.saveTo(slot)`, `runtime.loadFrom(slot)`,
    `runtime.listSaves(): SaveMeta[]`, `runtime.load(save): Promise<void>`

**このタスクが engine-spec の中心。** セーブ互換性に関わるため、
「実装したら壊れていた」では手遅れになる。テストを厚くする。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/save.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Runtime } from '../../src/engine/core/runtime.ts'
import { DEFAULT_SETTINGS } from '../../src/engine/core/settings.ts'
import { memoryStorage } from '../../src/engine/core/storage.ts'
import { LoadError } from '../../src/engine/core/save.ts'
import type { CompiledScript, Step } from '../../src/engine/core/script.ts'

const text = (i: number, body: string): Step => ({ t: 'text', i, h: `h${i}`, speaker: null, body })

/** 演出と本文が混ざった2シーンの台本 */
function fullScript(): CompiledScript {
  return {
    title: 't', protagonist: null, assets: {},
    scenes: [
      { id: 'A', steps: [
        { t: 'bg', name: 'room', fade: 0 },
        { t: 'bgm', name: 'daily' },
        text(0, '一'),
        { t: 'show', id: 'mika', expr: 'smile', pos: 'left' },
        { t: 'se', name: 'door' },
        text(1, '二'),
        { t: 'speed', value: 'slow' },
        text(2, '三'),
      ] },
      { id: 'B', steps: [{ t: 'bg', name: 'corridor', fade: 0 }, text(0, '四')] },
    ],
  }
}

function make(script = fullScript(), audio?: unknown) {
  const r = new Runtime({
    script, novelId: 'n', baseUrl: 'https://x.test/',
    storage: memoryStorage(),
    ...(audio ? { audio: audio as never } : {}),
  })
  r.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
  return r
}

const wait = (r: Runtime) => vi.waitFor(() => expect(r.getState().view.phase).toBe('waiting'), { timeout: 4000 })

/** n 回 advance してクリック待ちまで戻る */
async function step(r: Runtime, n: number) {
  for (let k = 0; k < n; k++) {
    r.advance()
    await wait(r)
  }
}

describe('セーブの表現', () => {
  it('シーンID・シーン入口スナップショット・本文ブロック連番の3つ', async () => {
    const r = make()
    void r.start()
    await wait(r)
    await step(r, 2)   // i:2 を表示中

    const save = r.makeSave()
    expect(save.scene).toBe('A')
    expect(save.index).toBe(2)
    // スナップショットは「シーンに入った瞬間」の値。@bg も @bgm もまだ実行されていない
    expect(save.snapshot).toEqual({
      bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {},
    })
  })

  it('index はセーブした瞬間に表示していたブロック（次ではない）', async () => {
    const r = make()
    void r.start()
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('一')
    expect(r.makeSave().index).toBe(0)
  })

  it('シーンをまたぐと入口スナップショットが更新される', async () => {
    const r = make()
    void r.start()
    await wait(r)
    await step(r, 3)   // シーン B の i:0
    const save = r.makeSave()
    expect(save.scene).toBe('B')
    expect(save.snapshot.bg).toBe('room')        // A で設定した背景が持ち越されている
    expect(save.snapshot.speed).toBe('slow')     // @speed も持ち越されている
    expect(save.snapshot.sprites).toEqual([{ id: 'mika', expr: 'smile', pos: 'left' }])
  })
})

describe('ロードとリプレイ', () => {
  it('セーブ時の画面が再現される', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    const b = make()
    void b.load(save)
    await wait(b)

    expect(b.getState().view.currentText?.body).toBe('三')   // i:2 を表示中
    expect(b.getState().progress).toMatchObject({ scene: 'A', index: 2 })
    expect(b.getState().snapshot).toEqual(a.getState().snapshot)
  })

  it('同じセーブから2回復元すると状態が完全に一致する（不変条件2）', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    const first = make()
    void first.load(structuredClone(save))
    await wait(first)

    const second = make()
    void second.load(structuredClone(save))
    await wait(second)

    expect(first.getState().snapshot).toEqual(second.getState().snapshot)
    expect(first.getState().progress).toEqual(second.getState().progress)
    expect(first.getState().view.currentText).toEqual(second.getState().view.currentText)
    expect(first.getState().view.backlog).toEqual(second.getState().view.backlog)
  })

  it('save → load でスナップショットがラウンドトリップする', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 3)
    const save = a.makeSave()

    const b = make()
    void b.load(JSON.parse(JSON.stringify(save)))
    await wait(b)
    expect(b.makeSave()).toEqual(save)
  })

  it('リプレイで通過した本文がバックログに積まれる', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)

    const b = make()
    void b.load(a.makeSave())
    await wait(b)
    expect(b.getState().view.backlog.map((e) => e.body)).toEqual(['一', '二', '三'])
  })

  it('リプレイ中は SE を鳴らさず、終了時に BGM を1度だけ同期する', async () => {
    const calls: string[] = []
    const audio = {
      unlock() {}, setVolumes() {}, resumeIfSuspended() {},
      syncBgm(n: string | null) { calls.push(`bgm:${n}`) },
      playSe(n: string) { calls.push(`se:${n}`) },
    }
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)

    const b = make(fullScript(), audio)
    void b.load(a.makeSave())
    await wait(b)

    expect(calls.filter((c) => c.startsWith('se:'))).toEqual([])
    expect(calls).toEqual(['bgm:daily'])
  })
})

describe('解決できない場合', () => {
  it('index がブロック数を超えたら最後のブロックにクランプする', async () => {
    const r = make()
    void r.load({ scene: 'A', index: 99, snapshot: r.getState().snapshot })
    await wait(r)
    expect(r.getState().progress.index).toBe(2)
    expect(r.getState().view.currentText?.body).toBe('三')
  })

  it('シーンが存在しなければロード失敗として明示する', async () => {
    const r = make()
    await expect(r.load({ scene: '無いシーン', index: 0, snapshot: r.getState().snapshot }))
      .rejects.toBeInstanceOf(LoadError)
  })
})

describe('連番の耐性', () => {
  it('演出行を挿入しても既存セーブの index が指す本文は変わらない', async () => {
    const a = make()
    void a.start()
    await wait(a)
    await step(a, 2)
    const save = a.makeSave()

    // シーン A の先頭に演出を3行足した台本
    const patched = fullScript()
    patched.scenes[0].steps.unshift(
      { t: 'wait', ms: 0 },
      { t: 'flashback', on: false },
      { t: 'se', name: 'x' },
    )

    const b = make(patched)
    void b.load(save)
    await wait(b)
    expect(b.getState().view.currentText?.body).toBe('三')
  })
})

describe('スロット', () => {
  it('保存・一覧・読み込みができる', async () => {
    const storage = memoryStorage()
    const opts = { script: fullScript(), novelId: 'n', baseUrl: 'https://x.test/', storage }
    const a = new Runtime(opts)
    a.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void a.start()
    await wait(a)
    await step(a, 1)
    a.saveTo('1')

    const list = a.listSaves()
    expect(list.map((m) => m.slot)).toContain('1')
    expect(list.find((m) => m.slot === '1')).toMatchObject({ scene: 'A', index: 1, preview: '二' })

    const b = new Runtime(opts)
    b.setSettings({ ...DEFAULT_SETTINGS, textMode: 'instant' })
    void b.loadFrom('1')
    await wait(b)
    expect(b.getState().view.currentText?.body).toBe('二')
  })

  it('セーブ可能点でなければ保存しない', () => {
    const r = make()
    expect(r.canSave()).toBe(false)
    expect(() => r.saveTo('1')).toThrow('セーブできるのはクリック待ちの瞬間だけ')
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/save.test.ts`
Expected: FAIL（`core/save.ts` が無い）

- [x] **Step 3: `src/engine/core/save.ts` を書く**

```ts
import type { Snapshot } from './state.ts'

/**
 * セーブ位置は シーンID ＋ シーン入口スナップショット ＋ 本文ブロック連番。
 * ページは実行時に端末ごとに決まるため、ここには現れない。
 */
export type SaveData = {
  scene: string
  snapshot: Snapshot
  /** セーブした瞬間に画面に表示されていた本文ブロックの連番（次ではない） */
  index: number
}

export type SaveMeta = {
  slot: string
  scene: string
  index: number
  savedAt: number
  /** 一覧に出す本文の冒頭 */
  preview: string
}

export class LoadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LoadError'
  }
}

type Stored = SaveData & { savedAt: number; preview: string }

export function serializeSave(save: SaveData, preview: string): string {
  return JSON.stringify({ ...save, savedAt: Date.now(), preview } satisfies Stored)
}

/** 壊れたデータ・別作品のデータを黙って通さない */
export function parseSave(raw: string | null): Stored | null {
  if (!raw) return null
  try {
    const d = JSON.parse(raw) as Partial<Stored>
    if (typeof d.scene !== 'string' || typeof d.index !== 'number' || !d.snapshot) return null
    return {
      scene: d.scene,
      index: d.index,
      snapshot: d.snapshot,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
      preview: typeof d.preview === 'string' ? d.preview : '',
    }
  } catch {
    return null
  }
}
```

- [x] **Step 4: `Runtime` にセーブとロードを足す**

import を足す。

```ts
import { LoadError, parseSave, serializeSave, type SaveData, type SaveMeta } from './save.ts'
import { saveKey } from './storage.ts'
```

フィールドを足す。

```ts
  /** リプレイの終了地点。この連番の本文に到達したら通常再生に戻る */
  private replayTarget = -1
  private readonly slots = ['auto', '1', '2', '3'] as const
```

`this.storage` は Task 13 でフィールドに持たせてある。

セーブ側。

```ts
  canSave(): boolean {
    return this.state.view.phase === 'waiting'
  }

  makeSave(): SaveData {
    return {
      scene: this.state.progress.scene,
      // 「シーンに入った瞬間」の値であって「セーブした瞬間」の値ではない。
      // リプレイが入口から再実行して現在の状態に着地させる
      snapshot: structuredClone(this.sceneEntry),
      index: this.state.progress.index,
    }
  }

  saveTo(slot: string): void {
    if (!this.canSave()) throw new Error('セーブできるのはクリック待ちの瞬間だけ')
    const preview = this.state.view.currentText?.body ?? ''
    this.storage.set(saveKey(this.novelId, slot), serializeSave(this.makeSave(), preview))
  }

  listSaves(): SaveMeta[] {
    const list: SaveMeta[] = []
    for (const slot of this.slots) {
      const data = parseSave(this.storage.get(saveKey(this.novelId, slot)))
      if (data) list.push({ slot, scene: data.scene, index: data.index, savedAt: data.savedAt, preview: data.preview })
    }
    return list
  }

  async loadFrom(slot: string): Promise<void> {
    const data = parseSave(this.storage.get(saveKey(this.novelId, slot)))
    if (!data) throw new LoadError('セーブデータが読めない')
    await this.load({ scene: data.scene, snapshot: data.snapshot, index: data.index })
  }
```

ロード側。

```ts
  /**
   * セーブ時の画面を再現する。
   * スナップショットを復元 → 0 から index-1 までを演出スキップでリプレイ
   * → index を通常表示してクリック待ち。
   */
  async load(save: SaveData): Promise<void> {
    const sceneIdx = this.script.scenes.findIndex((s) => s.id === save.scene)
    if (sceneIdx < 0) {
      // 黙って別の位置に飛ばさない
      throw new LoadError(`セーブされたシーンが台本に存在しない: ${save.scene}`)
    }
    const scene = this.script.scenes[sceneIdx]
    const blocks = scene.steps.filter((s) => s.t === 'text').length
    if (blocks === 0) throw new LoadError(`シーンに本文が1つもない: ${save.scene}`)

    // 変数は「宣言済みデフォルトにセーブ値を上書きマージ」。
    // 変数を後から足しても旧セーブが壊れない（宣言記法の導入時にデフォルトをここへ渡す）
    this.state.snapshot = structuredClone(save.snapshot)
    this.state.view.currentText = null
    this.state.view.visibleChars = 0
    this.backlog.clear()
    this.state.view.backlog = this.backlog.entries()

    // index がブロック数を超えていたら最後のブロックにクランプする
    this.replayTarget = Math.min(save.index, blocks - 1)
    this.replaying = true
    try {
      await this.runFrom(sceneIdx, 0)
    } finally {
      this.replaying = false
      this.replayTarget = -1
    }
  }
```

`exec` の先頭にリプレイ終了の判定を置く。

```ts
  protected async exec(step: Step): Promise<void> {
    if (this.replaying && step.t === 'text' && step.i === this.replayTarget) {
      // ここから通常再生。この本文は文字送りされ、クリック待ちになる
      this.replaying = false
      // リプレイ中は state だけ動かしていたので、実際の再生をここで1度だけ合わせる
      this.audio.syncBgm(this.state.snapshot.bgm, 0)
    }
    switch (step.t) { /* 以下そのまま */ }
  }
```

**リプレイ専用の分岐はこれで全部。** `waitForClick` / `perform` / `type` の
`if (this.replaying)`、`se` と `bgm` の `if (!this.replaying)`、そしてこの終了判定。
step の処理そのものには1つも入っていない。

- [x] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/core/save.test.ts`
Expected: PASS（12 tests）

- [x] **Step 6: オートセーブを繋ぐ**

`RuntimeOptions.onSaveable` は Task 6 で用意してある。`boot.tsx` で接続する。

```ts
  const runtime = new Runtime({
    // ...
    onSaveable: () => {
      // セーブ可能点に到達するたびに打つ。定義がそのままタイミングになるので、
      // 「フェード中にオートセーブを打たない」が構造的に満たされる
      try { runtime.saveTo('auto') } catch { /* 起動直後などは無視 */ }
    },
  })
```

`onSaveable` の中で `runtime` を参照するため、`const runtime` の初期化前に
評価されないようアロー関数の中で参照する（この書き方なら問題ない）。

- [x] **Step 7: `src/engine/ui/SaveMenu.tsx` を書く**

```tsx
import type { SaveMeta } from '../core/save.ts'

type Props = {
  mode: 'save' | 'load'
  slots: readonly string[]
  saves: SaveMeta[]
  onPick: (slot: string) => void
  onClose: () => void
}

const SLOT_LABEL: Record<string, string> = { auto: 'オート' }

export function SaveMenu({ mode, slots, saves, onPick, onClose }: Props) {
  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>{mode === 'save' ? 'セーブ' : 'ロード'}</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>
        <div className="wn-slots">
          {slots.map((slot) => {
            const meta = saves.find((s) => s.slot === slot)
            // オートセーブへの手動保存はさせない
            const disabled = mode === 'save' ? slot === 'auto' : !meta
            return (
              <button
                key={slot}
                className="wn-slot"
                disabled={disabled}
                onClick={() => onPick(slot)}
              >
                <span className="wn-slot-name">{SLOT_LABEL[slot] ?? `スロット ${slot}`}</span>
                {meta ? (
                  <>
                    <span className="wn-slot-where">{meta.scene}</span>
                    <span className="wn-slot-preview">{meta.preview.slice(0, 24)}</span>
                    <span className="wn-slot-time">{new Date(meta.savedAt).toLocaleString('ja-JP')}</span>
                  </>
                ) : (
                  <span className="wn-slot-empty">空き</span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

```css
.wn-slots { display: flex; flex-direction: column; gap: 1.2cqw; overflow-y: auto; }
.wn-slot {
  display: grid;
  grid-template-columns: 12cqw 16cqw 1fr auto;
  gap: 1.5cqw;
  align-items: baseline;
  padding: 1.4cqw 2cqw;
  font: inherit;
  font-size: 1.9cqw;
  text-align: left;
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.06);
  border: 0.12cqw solid rgba(255, 255, 255, 0.2);
  border-radius: 0.6cqw;
  cursor: pointer;
}
.wn-slot:disabled { opacity: 0.35; cursor: default; }
.wn-slot-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
.wn-slot-time, .wn-slot-empty { opacity: 0.55; font-size: 1.6cqw; }
```

- [x] **Step 8: `App.tsx` と `Title.tsx` にセーブ・ロードの導線を足す**

`Runtime` にスロット一覧を公開する。

```ts
  get saveSlots(): readonly string[] {
    return this.slots
  }
```

`App.tsx`:

```tsx
  const [ui, setUi] = useState<'none' | 'backlog' | 'save' | 'load'>('none')

  const pickSlot = (slot: string) => {
    if (ui === 'save') runtime.saveTo(slot)
    else void runtime.loadFrom(slot).catch((e: unknown) => alert(String(e)))
    setUi('none')
  }

  // ステージの中
  {(ui === 'save' || ui === 'load') && (
    <SaveMenu
      mode={ui}
      slots={runtime.saveSlots}
      saves={runtime.listSaves()}
      onPick={pickSlot}
      onClose={() => setUi('none')}
    />
  )}
```

「履歴」ボタンの隣に「セーブ」「ロード」を並べる（同じ `canOpenUi()` の条件下）。

`Title.tsx` の「つづきから」を有効化する。

```tsx
type Props = {
  title: string
  hasSave: boolean
  onStart: () => void
  onContinue: () => void
}

// ...
        <button className="wn-button" onClick={onContinue} disabled={!hasSave}>つづきから</button>
```

`App.tsx` 側:

```tsx
  const continueGame = () => {
    runtime.unlockAudio()
    setStarted(true)
    setUi('load')
  }

  // ...
  <Title
    title={runtime.script.title}
    hasSave={runtime.listSaves().length > 0}
    onStart={start}
    onContinue={continueGame}
  />
```

「つづきから」はロードメニューを開く。`unlockAudio()` はここでも
**同期的に**呼ぶこと（このクリックがジェスチャの機会）。

- [x] **Step 9: 実機で確認する**

1. 読み進めて「セーブ」→ スロット1に保存
2. リロード → タイトルの「つづきから」→ スロット1 → セーブ時の画面が出る
3. 背景・立ち絵・BGM・`@speed` が復元されている
4. リプレイ中に SE が連打されない
5. ロード直後にバックログを開くと、現在シーンの先頭からの分が入っている
6. `novels/kieta-ippen/script.wn` のシーン名を1つ書き換えて、
   そのシーンのセーブをロードすると「台本に存在しない」と明示される（黙って飛ばない）

確認したらシーン名は元に戻す。

- [x] **Step 10: コミット**

```bash
git add -A
git commit -m "feat: セーブ・ロード・リプレイとセーブUIを実装する"
```

---

### Task 16: 設定画面

**Files:**
- Create: `src/engine/ui/Settings.tsx`
- Modify: `src/engine/ui/App.tsx`, `src/engine/ui/style.css`

**Interfaces:**
- Consumes: `Settings`, `DEFAULT_SETTINGS`（Task 8）、`runtime.setSettings()`, `runtime.getSettings()`

設定はコアが持ち、変更のたびに永続化される（Task 13 で `setSettings` が保存する）。
UI は表示と入力だけを担当する。

- [x] **Step 1: `src/engine/ui/Settings.tsx` を書く**

```tsx
import type { Runtime } from '../core/runtime.ts'
import type { Settings as SettingsData } from '../core/settings.ts'

type Props = { runtime: Runtime; onClose: () => void }

const SPEEDS: { value: SettingsData['textSpeed']; label: string }[] = [
  { value: 'slow', label: '遅い' },
  { value: 'normal', label: '普通' },
  { value: 'fast', label: '速い' },
]

export function Settings({ runtime, onClose }: Props) {
  const s = runtime.getSettings()
  const update = (patch: Partial<SettingsData>) => runtime.setSettings({ ...s, ...patch })
  const volume = (patch: Partial<SettingsData['volume']>) =>
    runtime.setSettings({ ...s, volume: { ...s.volume, ...patch } })

  return (
    <div className="wn-overlay" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="wn-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wn-panel-head">
          <span>設定</span>
          <button className="wn-button" onClick={onClose}>閉じる</button>
        </div>

        <div className="wn-setting-row">
          <span>文字の表示</span>
          <div className="wn-choices">
            <button
              className={`wn-choice${s.textMode === 'sequential' ? ' is-on' : ''}`}
              onClick={() => update({ textMode: 'sequential' })}
            >逐次表示</button>
            <button
              className={`wn-choice${s.textMode === 'instant' ? ' is-on' : ''}`}
              onClick={() => update({ textMode: 'instant' })}
            >一括表示</button>
          </div>
        </div>

        <div className="wn-setting-row">
          <span>文字送りの速さ</span>
          <div className="wn-choices">
            {SPEEDS.map((sp) => (
              <button
                key={sp.value}
                className={`wn-choice${s.textSpeed === sp.value ? ' is-on' : ''}`}
                disabled={s.textMode === 'instant'}
                onClick={() => update({ textSpeed: sp.value })}
              >{sp.label}</button>
            ))}
          </div>
        </div>

        {([['master', '全体'], ['bgm', 'BGM'], ['se', '効果音']] as const).map(([key, label]) => (
          <div className="wn-setting-row" key={key}>
            <span>{label}の音量</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={s.volume[key]}
              onChange={(e) => volume({ [key]: Number(e.target.value) })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
```

一括表示を選んでいる間は速度の選択を無効にする（`@speed` ごと無視されるため）。

- [x] **Step 2: `style.css` に設定のスタイルを足す**

```css
.wn-setting-row {
  display: grid;
  grid-template-columns: 18cqw 1fr;
  gap: 2cqw;
  align-items: center;
}
.wn-choices { display: flex; gap: 1cqw; }
.wn-choice {
  padding: 0.8cqw 2cqw;
  font: inherit;
  font-size: 1.9cqw;
  color: #f2f2f2;
  background: rgba(255, 255, 255, 0.06);
  border: 0.12cqw solid rgba(255, 255, 255, 0.2);
  border-radius: 0.6cqw;
  cursor: pointer;
}
.wn-choice.is-on { background: rgba(255, 255, 255, 0.28); }
.wn-choice:disabled { opacity: 0.35; cursor: default; }
```

- [x] **Step 3: `App.tsx` に設定の導線を足す**

`ui` の型に `'settings'` を足し、ボタンを1つ増やす。
**設定はタイトル画面からも開けるようにする**（音量を先に決めたい読者のため）。

- [x] **Step 4: 実機で確認する**

1. 一括表示にすると文字が流れなくなる
2. そのとき `@speed slow` の箇所でも一括表示のまま（`@speed` が無視される）
3. 速度を変えると文字送りの速さが変わる
4. 音量スライダが BGM に反映される
5. リロードしても設定が残る

- [x] **Step 5: コミット**

```bash
git add -A
git commit -m "feat: 文字送りと音量の設定画面を追加する"
```

---

## フェーズ6: ページ送りと仕上げ

### Task 17: 自動ページ送り

**Files:**
- Create: `src/engine/ui/paginate.ts`
- Modify: `src/engine/core/runtime.ts`, `src/engine/ui/MessageBox.tsx`, `src/engine/ui/style.css`
- Test: `tests/core/paging.test.ts`

**Interfaces:**
- Consumes: `EngineState.view.pageBreaks`, `view.page`（Task 5）
- Produces:
  - `computePageBreaks(host: HTMLElement, text: string, maxHeight: number): number[]`
  - `runtime.enablePagination(): void`
  - `runtime.setPageBreaks(breaks: number[]): void`

**ページはセーブデータにも台本にも現れない。** 実行時に読者の環境で決まるため、
保存すると別端末で存在しないページを指す。ここで扱うのは `view` 層だけ。

**測定は UI の責務。** コアは DOM を触れないので、文字数の境界を数値で受け取る。

- [x] **Step 1: 失敗するテストを書く**

```ts
// tests/core/paging.test.ts
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
    await vi.waitFor(() => expect(r.isWaitingForPageBreaks()).toBe(true))
    r.setPageBreaks([0, 4, 8])
    await wait(r)

    expect(r.getState().view.page).toEqual({ current: 0, total: 3 })
    expect(r.getState().view.visibleChars).toBe(4)      // 0..3

    r.advance()
    await wait(r)
    expect(r.getState().view.page.current).toBe(1)
    expect(r.getState().view.visibleChars).toBe(8)      // 0..7

    r.advance()
    await wait(r)
    expect(r.getState().view.page.current).toBe(2)
    expect(r.getState().view.visibleChars).toBe(10)
  })

  it('最終ページのクリックで次の本文に進む', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await vi.waitFor(() => expect(r.isWaitingForPageBreaks()).toBe(true))
    r.setPageBreaks([0, 5])
    await wait(r)
    r.advance()
    await wait(r)
    r.advance()
    await vi.waitFor(() => expect(r.isWaitingForPageBreaks()).toBe(true))
    r.setPageBreaks([0])
    await wait(r)
    expect(r.getState().view.currentText?.body).toBe('次')
  })

  it('途中ページでもセーブでき、index は変わらない', async () => {
    const r = make()
    r.enablePagination()
    void r.start()
    await vi.waitFor(() => expect(r.isWaitingForPageBreaks()).toBe(true))
    r.setPageBreaks([0, 5])
    await wait(r)
    expect(r.canSave()).toBe(true)
    expect(r.makeSave().index).toBe(0)   // ページはセーブに現れない
  })
})
```

- [x] **Step 2: 実行して落ちることを確認する**

Run: `npx vitest run tests/core/paging.test.ts`
Expected: FAIL（`enablePagination` が無い）

- [x] **Step 3: `Runtime` にページ送りを足す**

フィールドを足す。

```ts
  /** UI が接続されている場合だけページ分割を行う。テストとリプレイでは1ページ扱い */
  private paginate = false
  private pageBreaksResolve: ((breaks: number[]) => void) | null = null
```

メソッドを足す。

```ts
  enablePagination(): void {
    this.paginate = true
  }

  /** UI 側が測定待ちを検知するため（テストでも使う） */
  isWaitingForPageBreaks(): boolean {
    return this.pageBreaksResolve !== null
  }

  /** UI が Range API で測った「各ページの先頭文字位置」を渡す。[0] は常に 0 */
  setPageBreaks(breaks: number[]): void {
    const normalized = breaks.length > 0 && breaks[0] === 0 ? breaks : [0, ...breaks]
    this.state.view.pageBreaks = normalized
    this.emit()
    const resolve = this.pageBreaksResolve
    this.pageBreaksResolve = null
    resolve?.(normalized)
  }

  private waitForPageBreaks(): Promise<number[]> {
    if (!this.paginate || this.replaying) return Promise.resolve([0])
    return new Promise<number[]>((resolve) => { this.pageBreaksResolve = resolve })
  }
```

`execText` を差し替える。

```ts
  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    this.read.add(step.h)
    this.backlog.push({ speaker: step.speaker, body: step.body })
    this.state.view.backlog = this.backlog.entries()

    this.state.progress.index = step.i
    this.state.view.currentText = { speaker: step.speaker, body: step.body }
    this.state.view.visibleChars = 0
    this.state.view.pageBreaks = [0]
    this.state.view.page = { current: 0, total: 1 }
    this.state.view.phase = 'performing'
    this.emit()

    // UI がこの本文を測り終えるまで待つ。ページ分割が無効なら即座に [0] が返る
    const breaks = await this.waitForPageBreaks()

    for (let p = 0; p < breaks.length; p++) {
      const end = p + 1 < breaks.length ? breaks[p + 1] : step.body.length
      this.state.view.page = { current: p, total: breaks.length }
      this.emit()
      await this.type(step.body, breaks[p], end)
      // ページ送り待ちもセーブ可能点。画面が静止して次のクリックを待っている点は最終ページと同じ
      await this.waitForClick()
    }
  }
```

`type` をページ範囲に対応させる。

```ts
  private async type(body: string, from: number, to: number): Promise<void> {
    const delay = charDelayMs(this.settings, this.state.snapshot.speed)
    if (this.replaying || delay === 0) {
      this.state.view.visibleChars = to
      this.emit()
      return
    }

    this.state.view.phase = 'typing'
    this.state.view.visibleChars = from
    this.skipTyping = false
    this.emit()

    for (let n = from + 1; n <= to; n++) {
      await sleep(delay)
      if (this.skipTyping) break
      this.state.view.visibleChars = n
      this.emit()
    }

    this.state.view.visibleChars = to
    this.emit()
  }
```

MessageBox は `body.slice(pageStart, visibleChars)` を描くことになるが、
**前のページの文字を残さない**ため、表示は `slice(pageBreaks[current], visibleChars)` にする。

- [x] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/`
Expected: PASS（既存テストも含め全部）

- [x] **Step 5: `src/engine/ui/paginate.ts` を書く**

```ts
/**
 * 枠に収まる位置でテキストを区切り、各ページの先頭文字位置を返す。
 * 戻り値の先頭は常に 0。1ページで収まるなら [0]。
 *
 * host は測定用の要素で、本番の本文と同じ幅・フォント・行間を持つこと。
 * ページごとに二分探索するので、測定回数は O(ページ数 × log 文字数) に収まる。
 */
export function computePageBreaks(host: HTMLElement, text: string, maxHeight: number): number[] {
  host.textContent = text
  const node = host.firstChild
  if (!(node instanceof Text) || text.length === 0) return [0]

  const range = document.createRange()
  const fits = (from: number, to: number): boolean => {
    range.setStart(node, from)
    range.setEnd(node, to)
    return range.getBoundingClientRect().height <= maxHeight
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
```

- [x] **Step 6: `MessageBox.tsx` に測定を組み込む**

```tsx
import { useEffect, useLayoutEffect, useRef } from 'react'
import { computePageBreaks } from './paginate.ts'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'

type Props = { runtime: Runtime; state: EngineState }

export function MessageBox({ runtime, state }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const text = state.view.currentText

  useEffect(() => {
    runtime.enablePagination()
  }, [runtime])

  // 本文が変わるたび、描画直後に測って境界をコアへ返す。
  // useLayoutEffect なので、測る前の1フレームが画面に出ることはない
  useLayoutEffect(() => {
    const host = measureRef.current
    const box = bodyRef.current
    if (!host || !box || !text) return
    const breaks = computePageBreaks(host, text.body, box.clientHeight)
    runtime.setPageBreaks(breaks)
  }, [runtime, text?.body])

  // 画面サイズが変わったら測り直す
  useEffect(() => {
    const onResize = () => {
      const host = measureRef.current
      const box = bodyRef.current
      if (!host || !box || !text) return
      runtime.setPageBreaks(computePageBreaks(host, text.body, box.clientHeight))
    }
    addEventListener('resize', onResize)
    return () => removeEventListener('resize', onResize)
  }, [runtime, text?.body])

  if (!text) return null

  const isProtagonistLine = text.speaker === null && text.body.startsWith('「')
  const name = text.speaker ?? (isProtagonistLine ? runtime.script.protagonist : null)
  const from = state.view.pageBreaks[state.view.page.current] ?? 0

  return (
    <div className="wn-messagebox">
      {name && <div className="wn-speaker">{name}</div>}
      <div className="wn-body" ref={bodyRef}>
        {text.body.slice(from, state.view.visibleChars)}
      </div>
      {/* 測定専用。本文と同じ幅・フォント・行間を持ち、画面には出ない */}
      <div className="wn-measure" ref={measureRef} aria-hidden />
      {state.view.page.total > 1 && (
        <div className="wn-page">{state.view.page.current + 1} / {state.view.page.total}</div>
      )}
    </div>
  )
}
```

`App.tsx` の `<MessageBox state={state} script={runtime.script} />` を
`<MessageBox runtime={runtime} state={state} />` に直す。

- [x] **Step 7: `style.css` に測定要素のスタイルを足す**

```css
.wn-messagebox { position: absolute; /* 既存のまま */ }
.wn-body { height: 15cqw; overflow: hidden; }
.wn-measure {
  position: absolute;
  left: 3cqw; right: 3cqw;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: pre-wrap;
}
.wn-page { position: absolute; right: 2cqw; bottom: 1cqw; font-size: 1.6cqw; opacity: 0.6; }
```

`.wn-measure` は `.wn-body` と**同じ幅・フォントサイズ・行間**でなければならない。
`.wn-messagebox` の `font-size` / `line-height` を継承し、左右の余白を揃えている。
片方だけ変えると測定がずれる。

- [x] **Step 8: 実機で確認する**

台本に長い1行を一時的に足して確かめる。

```
= scene ページ送り確認
これは非常に長い一行です。（同じ調子で400文字ほど書く）
```

1. 枠いっぱいで止まり、右下に `1 / 3` のような表示が出る
2. クリックで次ページに進む
3. 最終ページのクリックで次の本文に進む
4. ウィンドウ幅を変えるとページ数が変わる
5. 途中ページでセーブ →ロードすると、そのブロックの**先頭ページ**から始まる

確認したら足した行を消す。

- [x] **Step 9: コミット**

```bash
git add -A
git commit -m "feat: メッセージ枠に収まらない本文の自動ページ送りを実装する"
```

---

### Task 18: 開発用の開始位置指定と通し確認

**Files:**
- Modify: `src/engine/ui/App.tsx`, `src/engine/core/runtime.ts`, `docs/status.md`,
  `docs/engine-spec.md`, `docs/architecture.md`, `docs/script-syntax.md`
- Create: `docs/decisions/YYYY-MM-DD-implementation-decisions.md`

**Interfaces:**
- Consumes: `runtime.load()`（Task 15）
- Produces: `runtime.startAt(scene: string, index: number): Promise<void>`

- [ ] **Step 1: `Runtime` に開始位置指定を足す**

```ts
  /**
   * 指定のシーン・本文ブロックから開始する。セーブの復元とまったく同じ経路を通る。
   * 開発用だが、実装はロードそのものなので専用のコードはほとんど無い。
   */
  async startAt(scene: string, index: number): Promise<void> {
    await this.load({ scene, index, snapshot: this.getState().snapshot })
  }
```

- [ ] **Step 2: `App.tsx` で URL パラメータを読む**

```tsx
  const start = () => {
    runtime.unlockAudio()
    setStarted(true)

    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search)
      const scene = params.get('scene')
      if (scene) {
        // index はシーン内のローカル連番なので、scene と対でのみ意味を持つ
        const index = Number(params.get('index') ?? 0)
        void runtime.startAt(scene, Number.isFinite(index) ? index : 0)
          .catch((e: unknown) => alert(String(e)))
        return
      }
    }
    void runtime.start()
  }
```

`import.meta.env.DEV` で囲むため、**本番ビルドにはこの分岐が残らない**
（Vite が定数畳み込みで落とす）。

- [ ] **Step 3: 動作を確認する**

```bash
NOVEL=kieta-ippen npm run dev
```

`http://localhost:5173/?scene=屋上前&index=2` を開き、「はじめから」を押す。

1. 屋上前のシーンの3番目の本文から始まる
2. 背景 `rooftop_door` と立ち絵が復元されている
3. リプレイ中に SE が鳴らない

- [ ] **Step 4: 本番ビルドに含まれないことを確認する**

```bash
NOVEL=kieta-ippen npm run build
grep -r "params.get('scene')" dist/kieta-ippen/ || echo "本番ビルドに含まれていない"
```

Expected: 「本番ビルドに含まれていない」と出る

- [ ] **Step 5: 通しで読んで確認する**

```bash
NOVEL=kieta-ippen npm run build
npx vite preview --outDir dist/kieta-ippen
```

台本の先頭から末尾まで実際に読み、以下をすべて確認する。

| 確認項目 | 根拠 |
|---|---|
| タイトル画面が出て、BGM がボタン押下後に鳴る | 起動フロー |
| 全10命令が期待どおり動く | script-syntax.md |
| 背景・立ち絵・BGM・`@speed` がシーンをまたいで持ち越される | engine-spec |
| `@bgm daily` の再指定で曲が頭出しされない | engine-spec |
| セーブ → リロード → ロードで画面が再現される | engine-spec |
| 既読がセーブと独立して残る | engine-spec |
| バックログがシーンをまたいで遡れる | engine-spec |
| 演出中・文字送り中はセーブUIとバックログが開けない | engine-spec |
| ウィンドウをどんな比率にしてもレターボックスで 16:9 が保たれる | architecture |

- [ ] **Step 6: 全チェックを走らせる**

```bash
npm run typecheck && npm run lint && npm test && NOVEL=kieta-ippen npm run build
```

Expected: すべて PASS

- [ ] **Step 7: ドキュメントを更新する**

**着手前に確定させた10個の仕様**（この計画の冒頭）を、正式なドキュメントに反映する。

| ファイル | 更新内容 |
|---|---|
| `docs/decisions/YYYY-MM-DD-implementation-decisions.md` | 10項目の決定を経緯つきで記録（新規・以後凍結） |
| `docs/engine-spec.md` | 既読ハッシュの話者名 / オートセーブ / 文字送り中のクリック / 文字送りの実値 / リプレイ中の音声 / `phase` に `ended` |
| `docs/architecture.md` | 素材の解決を assets テーブルに / ページ分割の測定の責務 / `tests/` をディレクトリ構成図に |
| `docs/script-syntax.md` | 状態を「暫定」から「確定」に。命令は10個 |
| `docs/status.md` | 現在地を「実装フェーズ」に。命令数の誤記（14→10）を修正。残事項を更新 |

**決定記録は書き換えない。** 新しい決定は新しいファイルを足す。

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "feat: 開発用の開始位置指定を追加し、初期実装の仕様をドキュメントに反映する"
```

---

## 完了の定義

以下がすべて満たされたら初期実装は完了とする。

- [ ] `npm run typecheck` / `npm run lint` / `npm test` がすべて通る
- [ ] `NOVEL=kieta-ippen npm run build` が通り、`dist/kieta-ippen/` が自己完結している
- [ ] `drafts/sample-short.wn` を先頭から末尾まで通しで読める
- [ ] architecture.md のテスト一覧の9項目がすべてテストで固定されている
- [ ] engine-spec.md の不変条件4つがコードで守られている
- [ ] 着手前に確定させた10個の仕様がドキュメントに反映されている

## この計画が扱わないもの

残事項のまま。**台本に出てきていないため実装しない**（README 目標1）。

| 項目 | 理由 |
|---|---|
| 素材のプリロードとメモリ管理 | 残事項。`assets` があるので足す下地はできている |
| モバイルの縦持ちの画面 | 実際に読んでから決める |
| スキップUI | 後回しと決定済み。既読の**記録**だけ初期実装に含む |
| 分岐・変数の宣言記法 | 台本が一本道。`vars` の器だけ用意してある |
| 作品選択画面・作品横断のセーブ管理 | 2作目が存在してから |
| IndexedDB | localStorage の容量が足りなくなったら。interface は用意済み |
| 台本の複数ファイル分割 | 中長編になってから |
| エンジン名 | README 目標2 |

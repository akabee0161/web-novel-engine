# 実装構成

- 状態: **現在の確定構成**。この文書が常に正しい
- 更新方針: 構成が変わったらこのファイルを書き換える。
  経緯・却下した案は [decisions/](decisions/) に日付付きで残し、そちらは以後書き換えない
- エンジンの振る舞い（セーブ・既読・バックログ・音声）は [エンジン仕様](engine-spec.md)
- 決定の経緯は [技術スタックと、エンジン・作品の境界](decisions/2026-08-07-tech-stack-and-boundary.md)

## 技術スタック

| 領域 | 採用 |
|---|---|
| ビルドツール | Vite |
| UI | React + TypeScript |
| 描画方式 | DOM + CSS（Canvas / WebGL は使わない） |
| 音声 | Web Audio API |
| テスト | Vitest |
| ストレージ | localStorage（interface 越しに差し替え可能） |

## ディレクトリ構成

```
web-novel-engine/
├── vite.config.ts
├── src/engine/
│   ├── index.ts          ← 作品が触ってよい唯一の入口
│   ├── core/             ← React 非依存の素の TypeScript
│   │   ├── state.ts      EngineState 型
│   │   ├── runtime.ts    step の実行と進行制御
│   │   ├── save.ts       セーブデータの型・直列化・検証
│   │   ├── read.ts       既読 Set
│   │   ├── backlog.ts    リングバッファ
│   │   ├── audio.ts      Web Audio
│   │   ├── storage.ts    差し替え可能なストレージ interface
│   │   ├── settings.ts   読者設定と文字送りの実値
│   │   └── script.ts     コンパイル済み台本の型
│   └── ui/               ← React。core を購読して描くだけ
│       ├── boot.tsx      Runtime の組み立てと mount（作品から呼ばれる唯一の実体）
│       ├── App.tsx       タイトルと本編の切替、UI の開閉
│       ├── Stage.tsx     背景・立ち絵・回想オーバーレイ
│       ├── MessageBox.tsx ネームプレートと本文。ページ分割の測定
│       ├── Title.tsx     タイトル画面。音声 unlock の起点
│       ├── Backlog.tsx   読み返し
│       ├── SaveMenu.tsx  セーブ・ロード共用のスロット一覧
│       ├── Settings.tsx  読者設定
│       ├── paginate.ts   Range API による行数の測定
│       ├── speaker.ts    ネームプレートに出す名前の規則
│       ├── useEngine.ts  useSyncExternalStore のラッパ
│       └── style.css
├── tools/wn-compile/     ← 台本コンパイラ（Vite プラグイン）
├── tests/                ← src / tools をミラーする
│   ├── compile/
│   ├── core/
│   └── e2e/              ← Playwright。DOM でしか確認できないもの
└── novels/
    └── <作品ID>/
        ├── index.html
        ├── main.ts
        ├── script.wn
        ├── novel.config.json   ← 任意。素材の置き場所を差し替えるときだけ
        └── public/{bg,bgm,se,chara}/
```

**作品を1つ増やすコストは「`novels/` にディレクトリを1つ足す」だけ。** 設定ファイルは増えない。

## ビルドとデプロイ

```json
"scripts": {
  "dev":       "vite",
  "build":     "vite build",
  "build:all": "for d in novels/*/; do NOVEL=$(basename $d) vite build || exit 1; done",
  "test":      "vitest run",
  "test:e2e":  "playwright test",
  "gen:assets":"node tools/gen-dummy-assets.mjs novels/kieta-ippen/public",
  "lint":      "eslint .",
  "typecheck": "tsc --noEmit"
}
```

環境変数 `NOVEL` で対象作品を選ぶ。`build:all` の `|| exit 1` は、
1作品のビルドが失敗したときに残りを走らせず止めるため。

```
NOVEL=novelA npm run dev      # localhost:5173/
NOVEL=novelA npm run build    # dist/novelA/
```

**ビルド単位は作品ごと。** `dist/<作品ID>/` は `base: './'` により
配置場所に依存しない自己完結した成果物になる。

```
NOVEL=novelB npm run build
rsync -a --delete dist/novelB/ server:/var/www/html/novelB/   # 作品Bだけ
```

エンジンを改修したときは `npm run build:all` で全作品を再ビルドして追従させる。

ルーティングを持たないため、ホスティング側の SPA fallback や rewrite 設定は不要。

**注意** — `base: './'` は相対パス解決なので、末尾スラッシュなしの URL
（`domain.com/novelB`）で index.html が配信されると資産の参照が壊れる。
デプロイ先を決めたら自動リダイレクトの有無を最初に確認すること。

## 作品側のコード

```ts
// novels/novelA/main.ts
import { boot } from '@engine'
import script from './script.wn'

boot({ mount: document.getElementById('app')!, script, novelId: 'novelA' })
```

**`novelId` は作品側が明示的に渡す。** ディレクトリ名から自動で拾わない。
リネームした瞬間にストレージキー `wn:<作品ID>:save:1` が変わり、読者のセーブが消えるため。

素材は作品ごとの `public/` に置く。コンパイラが出した `assets` 表で
論理名から実パスを引き、現在のページ URL 基準の相対パスとして解決する。

```ts
new URL(script.assets[`bg/${name}`], document.baseURI)
```

台本は `@bg rain_street` と書くだけでよく、拡張子もデプロイ先のパスもエンジンが吸収する。

## 状態の3層

```ts
type EngineState = {
  snapshot: {                    // シーン境界で持ち越され、セーブに入る
    bg: string | null
    bgm: string | null
    sprites: Sprite[]
    speed: 'slow' | 'normal'
    flashback: boolean
    vars: Record<string, unknown>
  }
  progress: { scene: string; index: number; pc: number }
  view: {                        // 画面の一時状態。セーブに入らない
    phase: 'performing' | 'typing' | 'waiting' | 'ended'
    currentText: { speaker: string | null; body: string } | null
    visibleChars: number
    pageBreaks: number[]         // ページ先頭の文字位置。UI が測定して渡す
    page: { current: number; total: number }
    fadeMs: number
    backlog: BacklogEntry[]
  }
}
```

`phase` の `ended` は台本の終端に到達した状態。これがないと、終端で `waiting` のままになり
クリックで進めるように見えて何も起きない画面になる。**`ended` はセーブ可能点ではない。**

セーブは `structuredClone(state.snapshot)` の一行になる。
これにより「スナップショット対象のフィールド一覧」がコード上に二度現れなくなり、
新命令の追加時に更新し忘れる場所が消える（[不変条件4](engine-spec.md#設計上の不変条件)）。

`progress.pc` は `steps` 配列上の位置で、セーブには入らずリプレイで再計算される。

**新しい状態を足すときは、必ずどの層に置くかを選ぶこと。**
型は「忘れる」ことを防ぐが「間違える」ことは防がない。

## React との接続

```ts
const state = useSyncExternalStore(runtime.subscribe, runtime.getState)
```

**`useState` にエンジンの状態を置くコンポーネントを作らない。**
設定画面の一時的な入力値などは別だが、`snapshot` に属するものは必ずコア側にある。

音声はコアの `audio.ts` が Web Audio を直接持ち、React は触らない。
unlock はタイトル画面のボタンハンドラから同期的に `runtime.unlockAudio()` を呼ぶ
（`await` を挟むとジェスチャ資格が切れるため）。

### ページ分割の測定は UI の責務

コアは DOM を触れないため、テキスト測定は UI 層が行う。
UI が Range API で「枠に収まる文字数」を測り、境界を数値の配列でコアに渡す。

```ts
runtime.setPageBreaks(breaks: number[])   // [0, 42, 87] のような文字位置
```

コアは現在ページの文字範囲だけを文字送りの対象にする。
受け取るのが数値の配列だけなので React / DOM 非依存は保たれ、テストでは境界を直接渡せる。

**これは待ち合わせである。** コアは本文を出したあと測定待ちで止まり、
UI が答えるまで文字送りを始めない。**答えが来ないと進行が止まる。**

```
コア  currentText を出す → phase='performing' → 測定待ち ──┐
UI    再描画 → isWaitingForPageBreaks() → 測って返す ──────┘ → 文字送り
```

UI 側は本文の内容ではなく `runtime.isWaitingForPageBreaks()` で駆動すること。
本文をキーにすると、同じ本文が2回続いたときや同じブロックへロードし直したときに
測定が走らず、コアが待ったまま止まる。

`setPageBreaks()` が効くのは測定待ちのあいだだけで、本文の途中で渡しても無視する。
そのため画面サイズの変更は**次の本文ブロックから**反映される
（[2026-08-09 の決定](decisions/2026-08-09-implementation-decisions.md) 3）。

## 演出時間はコアが持ち、CSS に渡す

```ts
case 'bg':
  state.snapshot.bg = step.name
  await this.perform(step.fade ?? 0)   // phase='performing' にして fade ms 待つ
```

```tsx
<div style={{ transitionDuration: `${state.view.fadeMs}ms` }} />
```

**`transitionend` で演出完了を判定しない。**

1. タブが非アクティブなときなど、発火が保証されない
2. 判定が DOM 側にあると、描画を伴わないリプレイで完了を検知できない

時間の権威をコアに置くことで、「リプレイは演出の待ち時間をゼロにした通常再生」が
**待ち時間に 0 を渡すだけ**で実装される。

リプレイ専用の分岐は6箇所に閉じている。**step の処理そのものには1つも入っていない**ので、
命令を足すときにここを触る必要はない。

| 場所 | 内容 |
|---|---|
| `waitForClick` | 待たずに素通りする |
| `perform` | 待ち時間を消費しない |
| `type` | 即座に全文表示にする |
| `waitForPageBreaks` | 測定を待たず1ページ扱いにする |
| `requestRepaginate` | 再測定の要求を預からない（測定そのものをしないので消費先が無い） |
| `se` / `bgm` | SE は鳴らさず、BGM は `snapshot` だけ更新する |

加えて `exec` の先頭に、目的の連番に着いたらリプレイを終える判定が1つある。
そこで `audio.syncBgm()` を1度だけ呼び、実際の再生を状態に合わせる。

### ロードは走っている再生を打ち切る

`runFrom` は再生ループであり、ロードは新しいループを始める。
古いループが残ると、読者のクリックのたびに状態が元の位置へ引き戻される。

`Runtime` は世代番号を持ち、`load()` は世代を進めてから新しい再生を始める。
`runFrom` は step を1つ実行するたびに世代を確認し、変わっていたら黙って降りる。

**世代を進めるだけでは足りない。** 古いループは待ちの中で止まっていて判定に到達しないため、
打ち切る側が `clickResolve` と `performCancel` を呼んで待ちも解く。

そのため `load()` を呼んでよいのは**クリック待ちか、まだ再生を始めていないとき**だけ。
文字送りの最中に呼ぶと、打ち切られた側の文字送りが `visibleChars` を上書きしうる。
UI は `canOpenUi()` でこれを塞いでいる（型では守られていない）。

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

## 台本コンパイラ

`.wn` の import を Vite プラグインが JSON に変換する。作品側は普通に import するだけ。

```ts
import script from './script.wn'   // 型は CompiledScript
```

型は `src/engine/core/script.ts` に定義し、コンパイラがそれを import する。
**依存の向きは tools → engine の一方向。**

ビルド時に行うこと。

| 処理 | 内容 |
|---|---|
| パース | 行頭記号で分類。本文がデフォルト分類であり、失敗が存在しない |
| 既読ハッシュ | `シーン名 \n 話者名 \n 本文` を SHA-256、先頭12桁を `h` に埋める |
| 素材の解決 | `public/` をスキャンし、論理名 → 実パスの表を `assets` に出す（下記） |
| 検証 | 未知の命令、引数の不足・型違い、シーン名の重複をビルドエラーにする |

### 素材の置き場所

既定は `<作品ディレクトリ>/public`。作品ごとに `novel.config.json` を**任意で**置いて差し替えられる。

```json
{ "assetsDir": "../../../wn-assets/kieta-ippen" }
```

相対パスは作品ディレクトリ基準、絶対パスも使える。解決は
`tools/wn-compile/config.ts` の `resolveAssetsDir()` が唯一の担当で、
`publicDir`（Vite）と `wnCompile()`（コンパイラ）の両方がその結果を受け取る。

**設定ファイルは任意。** 必須にすると「作品を増やすコストはディレクトリ1つ」が崩れる。
明示した `assetsDir` が存在しなければビルドエラー（設定ミス）。
既定値 `public` の不在は許す（本文だけの作品が成立するため）。

**実素材はリポジトリに置かない。** git はバイナリの差分を持てないため履歴が単調増加し、
購入素材は公開リポジトリに置けない。`novels/*/public/` にあるのは動作確認用のダミーだけで、
`tools/gen-dummy-assets.mjs`（`npm run gen:assets`）で再生成できる。

**素材の秘匿はできない。** 静的サイトなので配信物は必ず取得できる。
この設定が守るのは「リポジトリに原本を置かない」ことだけであり、難読化・暗号化は設計に含めない。

### 素材の解決

**パスを step に埋め込まず、論理名 → 実パスの表を1つ出して実行時に引く。**

```json
"assets": {
  "bg/clubroom_day":   "bg/clubroom_day.svg",
  "chara/mika_normal": "chara/mika_normal.svg",
  "bgm/daily":         "bgm/daily.wav"
}
```

step に埋め込む方式は**立ち絵で成立しない。** `@show mika smile` は表情を省略できる仕様
（`@show mika pos:left` は表情を維持する）であり、その時点の表情はビルド時に確定しない。
静的な追跡はできるが、分岐が入ると到達経路が一意でなくなる
（engine-spec がスナップショットの静的計算を却下したのと同じ壁）。

存在チェックは**台本に書かれた引数**に対して行う。表情を省略した `@show` はチェックできないため、
実行時に表が引けなければ `console.warn` して立ち絵を出さない。

素材は1つの名前につき1ファイルだけ置く。同名で拡張子違いがあると、
台本側は拡張子を書かないためどちらが選ばれるか不定になる。

**これはプリロード用マニフェストではない。** 出力しないと決めたのは
シーンごとの使用素材一覧であり、パス解決表とは別物。プリロードは未着手のまま。

**パースエラーは `@` で始まる行にしか発生しない。** 記法を1つも使わない原稿は
全行が本文になって必ず通る（台本フォーマットの第一原則）。
話者名は自由文字列なので誤字を検出しない。

素材の置き忘れは実行時の404ではなくビルドエラーになる。

### 拡張子 `.wn`

**`.wn` = web novel。エンジン名が決まっても変更しない。**

台本は `@bg`、`= scene`、`>話者` という構文を持つ独自言語であり、
プレーンテキストが通るのはこの言語が `.txt` を包含しているからである。

## 開発時

台本の変更はフルリロードで反映する。その代償を開始位置指定が打ち消す。

```
localhost:5173/?scene=商店街&index=12
```

`import.meta.env.DEV` で囲み、本番ビルドには一切含めない。
`index` は省略可能で、省略時は 0（そのシーンの最初の本文ブロック）。
`index` はシーン内のローカルな連番なので、`scene` と対で指定する。

実装は開始位置まで作品先頭から演出スキップでリプレイするだけで、
セーブの復元と同じ経路を通る。

## 境界の強制

ESLint の `no-restricted-imports` で機械的に落とす。

| 禁止する import | 理由 |
|---|---|
| エンジン → `novels/` | エンジンが特定作品に依存しない |
| 作品 → `@engine` 以外の `src/engine/**` | 公開面を1つに保つ |
| `core/` → `ui/` | コアを React 非依存に保つ |
| エンジン → `tools/` | 型の依存を tools → engine の一方向に保つ |

## テスト

コアが React にも DOM にも依存しないため、Vitest で jsdom なしにテストできる。
engine-spec の不変条件が、そのままテストケースの一覧になる。

テストは `tests/` にソースをミラーして置く（`tests/compile/parse.test.ts` など）。
`vite.config.ts` が環境変数 `NOVEL` を要求するため、**config は `vitest.config.ts` に分ける。**
`NOVEL` を指定しないとテストが走らない状態を避けるため。

### ブラウザでしか確認できないもの

背景・立ち絵・音声・ページ分割は DOM でしか検証できない。
Playwright を `tests/e2e/` に置く（`npm run test:e2e`）。

| | 走らせるもの | コマンド |
|---|---|---|
| `tests/**/*.test.ts` | Vitest。jsdom なし | `npm test` |
| `tests/e2e/**/*.spec.ts` | Playwright。dev サーバを自動で立てる | `npm run test:e2e` |

**DOM の値を assert するテストだけを置く。スクリーンショット比較は採らない**
（壊れやすく、維持コストが実利を上回るため）。

進行の状態は `.wn-stage` の `data-phase` 属性に出す。CSS の演出フックであり、
E2E が文字送りの途中を掴まずに待つための手掛かりでもある。

| テスト | 内容 |
|---|---|
| **第一原則** | 記法を1つも含まないプレーンテキストが、全行本文としてパースされる |
| **リプレイの決定性** | 同じセーブから2回復元して `EngineState` が完全一致（不変条件2） |
| セーブのラウンドトリップ | save → load で `snapshot` が一致する |
| 連番の耐性 | 演出行を挿入しても既存セーブの `index` が指す本文が変わらない |
| 既読ハッシュの安定性 | 本文を変えたブロックだけ未読に戻り、他は無傷 |
| `@bgm` の意味論 | 同名再指定で鳴らし直さない |
| 各命令のパース | 命令それぞれが期待する step になる |
| 話者のスコープ | `>` が直後の1ブロックにだけ効く |
| コンパイルエラー | 未知の命令・シーン名の重複が行番号付きで落ちる |

セーブ互換性に関わるものは「実装したら壊れていた」では手遅れになるため、テストで固定する。

`storage.ts` を interface にするのは localStorage → IndexedDB の差し替えのためでもあるが、
テストでインメモリ実装を差せることのほうが日常的に効く。

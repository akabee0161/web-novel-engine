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
│   │   ├── save.ts       スナップショット・セーブ・ロード
│   │   ├── read.ts       既読 Set
│   │   ├── backlog.ts    リングバッファ
│   │   ├── audio.ts      Web Audio
│   │   ├── storage.ts    差し替え可能なストレージ interface
│   │   └── script.ts     コンパイル済み台本の型
│   └── ui/               ← React。core を購読して描くだけ
├── tools/wn-compile/     ← 台本コンパイラ（Vite プラグイン）
└── novels/
    └── <作品ID>/
        ├── index.html
        ├── main.ts
        ├── script.wn
        └── public/{bg,bgm,se,chara}/
```

**作品を1つ増やすコストは「`novels/` にディレクトリを1つ足す」だけ。** 設定ファイルは増えない。

## ビルドとデプロイ

```json
"scripts": {
  "dev":       "vite",
  "build":     "vite build",
  "build:all": "for d in novels/*/; do NOVEL=$(basename $d) vite build; done"
}
```

環境変数 `NOVEL` で対象作品を選ぶ。

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

素材は作品ごとの `public/` に置き、エンジンが現在のページ URL 基準の相対パスとして解決する。

```ts
new URL(`bg/${name}.webp`, document.baseURI)
```

台本は `@bg rain_street` と書くだけでよく、デプロイ先のパスはエンジンが吸収する。

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
    phase: 'performing' | 'typing' | 'waiting'
    currentText: { speaker: string | null; body: string } | null
    visibleChars: number
    page: { current: number; total: number }
    fadeMs: number
    backlog: BacklogEntry[]
  }
}
```

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
**待ち時間に 0 を渡すだけ**で実装される。リプレイ専用の分岐がどこにも入らない。

## 画面のスケーリング

基準解像度 **1280×720（16:9）** のステージをビューポートにフィットさせ、レターボックスする。
内部の寸法は `container-type: size` ＋ `cqw` 単位で表現する。

`transform: scale()` による一括拡縮は採らない。テキストがスケール後のラスタライズになり、
大画面で眠くなるため。

モバイルの縦持ちは未確定。

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
| 素材の解決 | `public/<種別>/<名前>.*` を探し、見つかったパスを `src` に埋める |
| 検証 | 未知の命令、引数の不足・型違い、シーン名の重複をビルドエラーにする |

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

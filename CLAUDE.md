# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

ブラウザで動くサウンドノベル / ビジュアルノベルエンジン。台本（`.wn`）をビルド時に JSON へ
コンパイルし、React 非依存のコアが実行する。作品は `novels/<作品ID>/` に1つずつ置く。

## 最初に読む

| 迷ったとき | 見る場所 |
|---|---|
| 今どこまで進んでいるか | `docs/status.md` |
| 何をするエンジンか（セーブ・既読・音声の仕様） | `docs/engine-spec.md` |
| どう作るか（構成・境界・テスト） | `docs/architecture.md` |
| 台本の書き方 | `docs/script-syntax.md` |
| 次に何を実装するか | `docs/implementation-plan.md` |
| なぜそう決めたか | `docs/decisions/` |

## 譲れない原則

1. **台本に出てこない機能は実装しない。** 命令を足す条件は「台本に書かれたこと」であって、
   他のエンジンにあることではない（`@move` はこれで一度失敗している）。
2. **`src/engine/core/**` は React も DOM も import しない。** ESLint が機械的に落とす。
   テキスト測定や音声の解禁など DOM が要るものは UI 層の責務。
3. **エンジンの状態は `EngineState` の1箇所だけ。** `useState` にエンジン状態を置かない。
   新しい状態は `snapshot` / `progress` / `view` のどれに置くか必ず選ぶ。
4. **配列は mutate せず置き換える。** `emit()` は3層を浅くコピーするだけなので、
   `sprites` や `backlog` を `push` すると参照が変わらず React が再描画しない。
5. **演出の待ち時間はコアが持つ。** `transitionend` で完了を判定しない。
   タブ非アクティブで発火せず、描画を伴わないリプレイでも検知できないため。
6. **作品IDは `boot()` に明示的に渡す。** ディレクトリ名から拾わない。
   リネームでストレージキーが変わり、読者のセーブが消える。
7. **実素材はリポジトリに置かない。** `novels/*/public/` にあるのは動作確認用のダミー。
   実素材は `novel.config.json` の `assetsDir` で外を指す。

## コマンド

**Node 22 以上。** `vite.config.ts` / `vitest.config.ts` が `import.meta.dirname` を使う。
`package.json` の `engines` に書いてあるが、npm は既定では警告（EBADENGINE）を出すだけで
インストールを止めない。古い Node で動かすと実行時に落ちる。

```bash
NOVEL=kieta-ippen npm run dev     # 開発サーバ（NOVEL は必須）
NOVEL=kieta-ippen npm run build   # dist/kieta-ippen/ に出力
npm run build:all                 # 全作品を再ビルド

npm test          # Vitest。jsdom なし
npm run test:e2e  # Playwright。dev サーバは自動で立つ
npm run lint
npm run typecheck
npm run gen:assets  # 1作目のダミー素材を再生成する
```

**拡張子と置き場所で走らせる側が決まる。** `tests/**/*.test.ts` は Vitest、
`tests/e2e/**` は Playwright。`vitest.config.ts` が `tests/e2e/**` を除外しているため、
`tests/e2e/` に `.test.ts` を置いても Vitest は拾わず、Playwright だけが走る
（Playwright の既定の `testMatch` は `.spec.ts` と `.test.ts` の両方に当たる）。
命名は `.spec.ts` で揃える。

**コードを変えたら `npm run typecheck && npm run lint && npm test` を通してから報告する。**
DOM に関わる変更（UI・演出・ページ分割）は `npm run test:e2e` も走らせる。

> `| tail` などでパイプすると exit code が隠れる。`set -o pipefail` を付けるか、
> 素で走らせて確認すること。

## ドキュメントの書き分け

| 置き場所 | 役割 | 更新 |
|---|---|---|
| `docs/engine-spec.md` | 現在の確定仕様（何をするか） | 仕様が変わったら**書き換える** |
| `docs/architecture.md` | 現在の確定構成（どう作るか） | 構成が変わったら**書き換える** |
| `docs/script-syntax.md` | 台本の書き方 | 記法が変わったら**書き換える** |
| `docs/decisions/YYYY-MM-DD-*.md` | いつ何をどう決めたかの記録 | **書き換えない。** 新しい決定は新しいファイルを足す |
| `docs/status.md` | セッションをまたぐ引き継ぎ | 随時 |
| `docs/implementation-plan.md` | 18タスクの手順。`- [ ]` で進捗 | 実装しながら埋める |

**決定記録は執筆時点のスナップショット。** 現在の仕様と食い違っていても直さない。
それが記録としての価値。仕様を変えたときは、新しい決定記録を足したうえで
`engine-spec.md` を書き換える。

計画どおりにいかなかった点は `docs/implementation-plan.md` の「計画からの逸脱の記録」に足す。

## 作業の進め方

- **コミット前に一度止めて確認を取る。** docs だけの修正でも編集からコミットまで一続きにしない
- Conventional Commits（`feat:` / `fix:` / `test:` / `chore:` / `docs:`）
- エラーメッセージ・コメント・ドキュメントは日本語
- 実装は `docs/implementation-plan.md` の Task 単位。1タスク1コミット

## 境界

ESLint の `no-restricted-imports` が機械的に守っている。次の import は全て禁止。

| 禁止 | 理由 |
|---|---|
| エンジン → `novels/` | エンジンが特定作品に依存しない |
| 作品 → `@engine` 以外の `src/engine/**` | 公開面を1つに保つ |
| `core/` → `ui/`、`core/` → `react` | コアを React 非依存に保つ |
| エンジン → `tools/` | 型の依存を tools → engine の一方向に保つ |

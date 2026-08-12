# 原稿 → `.wn` 変換スキル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 小説原稿（地の文とカギ括弧の会話が混ざったプレーンテキスト）を `.wn` 台本に変換する
Claude Code スキル `novel-to-wn` を追加し、2作目の実地変換に使える状態にする。

**Architecture:** 決定的に処理できる部分（作品ディレクトリの雛形作成、構文とシーン名一意性の検証）は
`tools/` 配下のテスト済み TypeScript ユーティリティとして実装する。文脈判断が要る部分
（話者推定・シーン区切り・演出提案）はスキルのプロンプト（`SKILL.md`）が担い、
判断が割れる箇所には `# TODO:` コメントを残して人間のレビューに渡す。

**Tech Stack:** TypeScript（Node 22 の型ストリッピングで `node` から直接実行できる形にする。
`ts-node` 等の新規依存は追加しない）、Vitest、既存の `tools/wn-compile/parse.ts`。

**設計の根拠:** `docs/superpowers/specs/2026-08-12-novel-to-wn-design.md`（決定1〜4）。
この計画で実装の詳細を詰めた際、設計にはない実装上の決定が2つ生じた。

- **自己検証は `tools/wn-compile` のフル `compile()`（素材チェックあり）ではなく、
  構文とシーン名一意性だけを見る `parse()` ベースの軽量版にする。** 素材の実在確認は
  設計の「スコープ外」（実素材の用意）に踏み込んでしまうため
- **`tools/wn-compile/parse.ts` の `WnError` を TS のパラメータプロパティ省略記法から
  明示的なフィールド宣言へ書き換える。** Node 22 の型ストリッピング実行
  （`node tools/xxx.ts` を `tsx` 等を追加せず直接動かす）はパラメータプロパティを
  サポートしないため。動作は変わらない機械的な書き換え（Task 2 Step 1 で検証済みの前提）

## Global Constraints

- Node 22 以上（`package.json` の `engines`）
- コミットメッセージは Conventional Commits（`feat:` / `fix:` / `test:` / `docs:` / `chore:`）
- **各タスク末尾の commit は、実行前に必ず人間の確認を取る。** 変更内容（diff）を提示し、
  承認を得てから `git commit` する。ドキュメントだけの変更でも例外にしない
  （`CLAUDE.md` 「作業の進め方」／このリポジトリの標準ルール）
- 新規に追加する `tools/` 配下のファイルはすべて `.ts`。CLI として直接実行できる形にし、
  `tsx` / `ts-node` 等の新規 devDependency は追加しない（Node 22 の型ストリッピングで足りる）
- コードを変更したタスクは `npm run typecheck && npm run lint && npm test` を通してから
  完了報告する（`CLAUDE.md`）
- `src/engine/**` には触れない。この計画の変更はすべて `tools/`・`.claude/skills/`・`docs/` に閉じる

---

## Task 1: 作品ディレクトリのスキャフォールド (`tools/scaffold-novel`)

**Files:**
- Create: `tools/scaffold-novel/index.ts`
- Test: `tests/scaffold-novel/scaffold-novel.test.ts`
- Modify: `package.json`（npm script 追加）

**Interfaces:**
- Produces: `scaffoldNovel(opts: { novelsDir: string; templateId: string; novelId: string }): { dir: string }`
  - `novelsDir` 配下に `templateId` の作品ディレクトリが無ければ `Error` を投げる
  - `novelsDir/novelId` が既に存在すれば `Error` を投げる
  - 成功時は `novelsDir/novelId` に `index.html`・`main.ts`・`public/{bg,bgm,chara,se}/`（空、`.gitkeep` 付き）を作る。
    `script.wn` は作らない
  - CLI: `node tools/scaffold-novel/index.ts <雛形の作品ID> <新規作品ID>`
    （`novelsDir` はこのファイルの2つ上のディレクトリの `novels/` に固定）

- [ ] **Step 1: 失敗するテストを書く**

`tests/scaffold-novel/scaffold-novel.test.ts` を作成する。

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scaffoldNovel } from '../../tools/scaffold-novel/index.ts'

/** kieta-ippen 相当の最小の雛形を作った novels/ ディレクトリ */
function fixtureNovelsDir(): string {
  const novelsDir = mkdtempSync(join(tmpdir(), 'novels-'))
  const templateDir = join(novelsDir, 'template-novel')
  mkdirSync(templateDir, { recursive: true })
  writeFileSync(
    join(templateDir, 'index.html'),
    '<!doctype html>\n<html><head><title>元のタイトル</title></head><body></body></html>\n',
  )
  writeFileSync(
    join(templateDir, 'main.ts'),
    [
      "import { boot } from '@engine'",
      "import script from './script.wn'",
      '',
      'boot({',
      "  mount: document.getElementById('app')!,",
      '  script,',
      "  novelId: 'template-novel',",
      '})',
      '',
    ].join('\n'),
  )
  return novelsDir
}

describe('scaffoldNovel', () => {
  it('index.html と main.ts を作品ID差し替えでコピーする', () => {
    const novelsDir = fixtureNovelsDir()

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    expect(dir).toBe(join(novelsDir, 'new-novel'))
    const mainTs = readFileSync(join(dir, 'main.ts'), 'utf8')
    expect(mainTs).toContain("novelId: 'new-novel'")
    expect(mainTs).not.toContain('template-novel')
    const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8')
    expect(indexHtml).toContain('<title>new-novel</title>')
  })

  it('public/{bg,bgm,chara,se} を空で作る', () => {
    const novelsDir = fixtureNovelsDir()

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    for (const sub of ['bg', 'bgm', 'chara', 'se']) {
      expect(existsSync(join(dir, 'public', sub))).toBe(true)
    }
  })

  it('script.wn はコピーしない', () => {
    const novelsDir = fixtureNovelsDir()
    writeFileSync(join(novelsDir, 'template-novel', 'script.wn'), '= scene A\nテスト')

    const { dir } = scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' })

    expect(existsSync(join(dir, 'script.wn'))).toBe(false)
  })

  it('雛形が存在しなければエラーにする', () => {
    const novelsDir = mkdtempSync(join(tmpdir(), 'novels-'))

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'no-such', novelId: 'new-novel' }),
    ).toThrow('雛形の作品ディレクトリが見つからない')
  })

  it('作品IDが既に存在すればエラーにする', () => {
    const novelsDir = fixtureNovelsDir()
    mkdirSync(join(novelsDir, 'new-novel'))

    expect(() =>
      scaffoldNovel({ novelsDir, templateId: 'template-novel', novelId: 'new-novel' }),
    ).toThrow('作品ディレクトリが既に存在する')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run tests/scaffold-novel/scaffold-novel.test.ts`
Expected: FAIL（`tools/scaffold-novel/index.ts` が存在しない、import エラー）

- [ ] **Step 3: 実装する**

`tools/scaffold-novel/index.ts` を作成する。

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export type ScaffoldNovelOptions = {
  /** novels/ ディレクトリの絶対パス */
  novelsDir: string
  /** 雛形にする既存の作品ID */
  templateId: string
  /** 新規作品ID */
  novelId: string
}

const ASSET_SUBDIRS = ['bg', 'bgm', 'chara', 'se']

/**
 * 既存作品を雛形に、新規作品ディレクトリを作る。
 * script.wn は含まない（novel-to-wn スキルが別途生成する）。
 */
export function scaffoldNovel(opts: ScaffoldNovelOptions): { dir: string } {
  const { novelsDir, templateId, novelId } = opts
  const templateDir = join(novelsDir, templateId)
  const targetDir = join(novelsDir, novelId)

  if (!existsSync(templateDir)) {
    throw new Error(`雛形の作品ディレクトリが見つからない: ${templateDir}`)
  }
  if (existsSync(targetDir)) {
    throw new Error(`作品ディレクトリが既に存在する: ${targetDir}`)
  }

  mkdirSync(targetDir, { recursive: true })
  writeFileSync(join(targetDir, 'index.html'), buildIndexHtml(novelId))
  writeFileSync(join(targetDir, 'main.ts'), buildMainTs(templateDir, novelId))

  for (const sub of ASSET_SUBDIRS) {
    const dir = join(targetDir, 'public', sub)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.gitkeep'), '')
  }

  return { dir: targetDir }
}

function buildIndexHtml(novelId: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${novelId}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`
}

function buildMainTs(templateDir: string, novelId: string): string {
  const templatePath = join(templateDir, 'main.ts')
  const template = readFileSync(templatePath, 'utf8')
  const replaced = template.replace(/novelId:\s*'[^']*'/, `novelId: '${novelId}'`)
  if (replaced === template) {
    throw new Error(`雛形の main.ts に novelId の指定が見つからない: ${templatePath}`)
  }
  return replaced
}

// CLI: node tools/scaffold-novel/index.ts <雛形の作品ID> <新規作品ID>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [templateId, novelId] = process.argv.slice(2)
  if (!templateId || !novelId) {
    console.error('使い方: node tools/scaffold-novel/index.ts <雛形にする作品ID> <新規作品ID>')
    process.exit(1)
  }
  const novelsDir = resolve(import.meta.dirname, '..', '..', 'novels')
  const { dir } = scaffoldNovel({ novelsDir, templateId, novelId })
  console.log(`作品ディレクトリを作成した: ${dir}`)
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run tests/scaffold-novel/scaffold-novel.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: CLI として実際に動くことを手で確認する**

Run:
```bash
node tools/scaffold-novel/index.ts kieta-ippen zz-scaffold-check
ls novels/zz-scaffold-check
cat novels/zz-scaffold-check/main.ts
rm -rf novels/zz-scaffold-check
```
Expected: `index.html` / `main.ts` / `public/{bg,bgm,chara,se}` が作られ、
`main.ts` の `novelId` が `'zz-scaffold-check'` になっている。確認後は必ず削除する
（実際の2作目作成は Task 3 完了後にスキル経由で行うため、ここは動作確認のみ）

- [ ] **Step 6: package.json に npm script を足す**

`"gen:assets"` の行の直後に追加する。

```json
"scaffold:novel": "node tools/scaffold-novel/index.ts",
```

- [ ] **Step 7: 型検査・lint・全体テストを通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 8: 差分を提示し、確認を得てからコミットする**

変更ファイル（`tools/scaffold-novel/index.ts`、`tests/scaffold-novel/scaffold-novel.test.ts`、
`package.json`）の diff を人間に提示し、承認を得てから:

```bash
git add tools/scaffold-novel/index.ts tests/scaffold-novel/scaffold-novel.test.ts package.json
git commit -m "feat: 作品ディレクトリの雛形作成ツールを追加する"
```

---

## Task 2: 構文とシーン名一意性の自己検証 (`tools/wn-compile/validate.ts`)

**Files:**
- Modify: `tools/wn-compile/parse.ts`（`WnError` の書き換えのみ。パースロジックは変更しない）
- Create: `tools/wn-compile/validate.ts`
- Test: `tests/compile/validate.test.ts`
- Modify: `package.json`（npm script 追加）

**Interfaces:**
- Consumes: `parse(source: string, file: string): ParseResult`、`class WnError extends Error`
  （いずれも `tools/wn-compile/parse.ts` の既存export。`WnError` は書き換え後も
  `file` / `line` / `message` / `name` を持つ点は変わらない）
- Produces: `validateScript(source: string, file: string): { ok: true } | { ok: false; message: string }`
  - CLI: `node tools/wn-compile/validate.ts <script.wn のパス>`

- [ ] **Step 1: `WnError` を Node の型ストリッピングで実行できる形に書き換える**

`tools/wn-compile/parse.ts` の該当箇所を書き換える。TS のパラメータプロパティ省略記法
（`constructor(readonly file: string, ...)`）は Node の型ストリッピング実行では
サポートされないため、明示的なフィールド宣言に展開する。**動作は変えない。**

変更前:
```ts
export class WnError extends Error {
  constructor(readonly file: string, readonly line: number, message: string) {
    super(`${file}:${line}: ${message}`)
    this.name = 'WnError'
  }
}
```

変更後:
```ts
export class WnError extends Error {
  readonly file: string
  readonly line: number

  constructor(file: string, line: number, message: string) {
    super(`${file}:${line}: ${message}`)
    this.file = file
    this.line = line
    this.name = 'WnError'
  }
}
```

- [ ] **Step 2: 既存テストが壊れていないことを確認する（回帰チェック）**

Run: `npx vitest run tests/compile/`
Expected: 既存の `compile.test.ts` / `config.test.ts` / `parse.test.ts` / `sample.test.ts` が
すべて PASS のまま（`WnError.message` の文言は変えていないため）

- [ ] **Step 3: 失敗するテストを書く**

`tests/compile/validate.test.ts` を作成する。

```ts
import { describe, expect, it } from 'vitest'
import { validateScript } from '../../tools/wn-compile/validate.ts'

describe('validateScript', () => {
  it('構文的に正しければ ok:true を返す', () => {
    const result = validateScript('= scene A\nこんにちは', 'test.wn')
    expect(result).toEqual({ ok: true })
  })

  it('シーン名が重複していれば ok:false とエラーメッセージを返す', () => {
    const result = validateScript('= scene A\nテキスト\n= scene A\nテキスト2', 'test.wn')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('test.wn:3: シーン名が重複している: A')
  })

  it('未知の命令はエラーにする', () => {
    const result = validateScript('@bgx 何か', 'test.wn')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('test.wn:1: 未知の命令: @bgx')
  })

  it('素材の実在は検査しない（フル compile() と違う）', () => {
    const result = validateScript('= scene A\n@bg 存在しない背景', 'test.wn')
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 4: テストを実行して失敗を確認する**

Run: `npx vitest run tests/compile/validate.test.ts`
Expected: FAIL（`tools/wn-compile/validate.ts` が存在しない）

- [ ] **Step 5: 実装する**

`tools/wn-compile/validate.ts` を作成する。

```ts
import { readFileSync } from 'node:fs'
import { parse, WnError } from './parse.ts'

export type ValidateResult = { ok: true } | { ok: false; message: string }

/**
 * script.wn の構文とシーン名の一意性だけを検査する。
 * 素材の実在は見ない（フル compile() と違う。実素材の用意はスキルのスコープ外のため）。
 */
export function validateScript(source: string, file: string): ValidateResult {
  try {
    parse(source, file)
    return { ok: true }
  } catch (e) {
    if (e instanceof WnError) return { ok: false, message: e.message }
    throw e
  }
}

// CLI: node tools/wn-compile/validate.ts <script.wn のパス>
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2]
  if (!file) {
    console.error('使い方: node tools/wn-compile/validate.ts <script.wn のパス>')
    process.exit(1)
  }
  const source = readFileSync(file, 'utf8')
  const result = validateScript(source, file)
  if (result.ok) {
    console.log(`OK: ${file}`)
  } else {
    console.error(result.message)
    process.exit(1)
  }
}
```

- [ ] **Step 6: テストを実行して成功を確認する**

Run: `npx vitest run tests/compile/validate.test.ts`
Expected: PASS（4件）

- [ ] **Step 7: CLI として実際に動くことを手で確認する**

Run:
```bash
node tools/wn-compile/validate.ts novels/kieta-ippen/script.wn
```
Expected: `OK: novels/kieta-ippen/script.wn`

- [ ] **Step 8: package.json に npm script を足す**

`"scaffold:novel"` の行の直後に追加する。

```json
"wn:validate": "node tools/wn-compile/validate.ts",
```

- [ ] **Step 9: 型検査・lint・全体テストを通す**

Run: `npm run typecheck && npm run lint && npm test`
Expected: すべて成功

- [ ] **Step 10: 差分を提示し、確認を得てからコミットする**

変更ファイル（`tools/wn-compile/parse.ts`、`tools/wn-compile/validate.ts`、
`tests/compile/validate.test.ts`、`package.json`）の diff を人間に提示し、承認を得てから:

```bash
git add tools/wn-compile/parse.ts tools/wn-compile/validate.ts tests/compile/validate.test.ts package.json
git commit -m "feat: script.wn の構文自己検証コマンドを追加する"
```

---

## Task 3: `novel-to-wn` スキル本体

**Files:**
- Create: `.claude/skills/novel-to-wn/SKILL.md`

**Interfaces:**
- Consumes: Task 1 の `node tools/scaffold-novel/index.ts <雛形の作品ID> <新規作品ID>`、
  Task 2 の `node tools/wn-compile/validate.ts <script.wn のパス>`
- Produces: `/novel-to-wn <原稿ファイルパス> <作品ID>` で呼び出せる Claude Code スキル

このタスクはプロンプト資産の作成であり、自動テストは書けない。Step 2 で手動の動作確認を行う。

- [ ] **Step 1: `SKILL.md` を作成する**

`.claude/skills/novel-to-wn/SKILL.md` を作成する。

```markdown
---
name: novel-to-wn
description: 小説原稿（地の文とカギ括弧の会話が混ざったプレーンテキスト）を web-novel-engine の .wn 台本に変換する。話者付与・シーン区切り・演出命令を一気に下書きし、tools/wn-compile/validate.ts で自己検証してから人間のレビューに渡す。/novel-to-wn で呼ぶ。
---

# Novel to WN

## Overview

完成した小説原稿を web-novel-engine の `.wn` 台本に変換するスキル。原稿そのものの執筆は担当しない
（`../ai-writing` の責務）。ここで担当するのは、原稿には存在しない情報——話者・シーン境界・演出——を
下書きし、`.wn` として構文的に正しい形に変換するところまで。

**前提**: `docs/script-syntax.md` が `.wn` の構文の正典。このスキルはそこに書かれた規則を
複製せず、都度参照する。本ファイルの記述と `docs/script-syntax.md` が食い違ったら
`docs/script-syntax.md` を優先する。

## Invocation

\`\`\`
/novel-to-wn <原稿ファイルパス> <作品ID>
\`\`\`

引数が足りない場合は **1つずつ順番に** 質問して収集する。

1. **原稿ファイルパスが不明な場合**: パスを尋ねる
2. **作品IDが不明な場合**: 半角英数字とハイフンのみで構成される短い識別子を尋ねる。
   `novels/<作品ID>/` がストレージキーの一部になるため、後から変えると読者のセーブが消える
   （`CLAUDE.md` 譲れない原則6）ことを伝えたうえで確認を取る

## Workflow

以下の手順を順番に実行する。各ステップの前提・出力は次のステップに引き継がれる。

### 1. 入力確認

- 原稿ファイルを Read する
- `novels/<作品ID>/` が既に存在し、かつ `script.wn` も存在する場合は、上書きしてよいか確認を取る。
  拒否されたらここで終了する
- `novels/<作品ID>/` が存在するが `script.wn` がない場合（スキャフォールドだけ済んでいる状態）は
  そのまま3へ進む

### 2. スキャフォールド

`novels/<作品ID>/` が存在しない場合、次のコマンドで雛形から作る。

\`\`\`bash
node tools/scaffold-novel/index.ts kieta-ippen <作品ID>
\`\`\`

これで `novels/<作品ID>/index.html`・`main.ts`・`public/{bg,bgm,chara,se}/`（空）が作られる。
`script.wn` は作られない（このスキルがこの後の手順で作る）。

### 3. ブロック化

原稿を改行単位で本文ブロックへ変換する。`docs/script-syntax.md` の「本文ブロック」節にある
第一原則により、無記号の地の文と `「」` の会話はそのままで最小の台本として成立する。

- 1行1ブロックが基本。原稿の1文が長い場合、無理に改行で割らず、自動ページ送り
  （枠に収まらない場合の自動改ページ）に任せてよい。ただし読点の少ない長文が続く場合は
  読みやすさのため改行を入れてよい
- 空行は無視されるので、原稿の段落区切りをそのまま空行として残してよい
- 行頭が `「` でない限り地の文として扱われる（`docs/script-syntax.md` の「テキストの種類」節）

### 4. 話者付与

`「」` の発話について、直前・直後の地の文の文脈（「〜と〇〇が言った」「〇〇は言った、『…』」等の手がかり）
から話者を推定する。

- 主人公の発話には何もつけない（無印の `「」` は自動的に `@protagonist` の名前になる）
- 主人公以外の発話には、直前の行に `>名前` を挿入する。`>` は直後の1ブロックにのみ効く
  （`docs/script-syntax.md` の「話者の指定」節）
- 文脈だけでは判断できない場合、話者を仮に決めたうえで直前行に
  `# TODO: 話者「〇〇」で合っているか?` をコメントとして残す。仮の話者名は空欄にせず、
  最も可能性が高いものを入れる（本文ブロックの直前に空の `>` を置くと
  `docs/script-syntax.md` の「話者を伏せる」用法と区別がつかなくなるため）

### 5. シーン区切り

章見出しや「＊＊＊」のような区切り記号、時間・場所の大きな転換を手がかりに
`= scene <一意な名前>` を挿入する。

- シーン名は「場所・時間帯」のような自然な名前にする（例: `部室・放課後`）。
  `docs/script-syntax.md` の「シーン宣言」節にあるとおり、シーン名は作品内で一意でなければならない
- 実用上の粒度は章〜節。原稿の細かい場面転換すべてに対応させる必要はない
  （場所も人物も変わらない空気の変化は `= scene` を割らずに地の文で表現してよい）
- シーンをまたいでも背景・BGM・立ち絵などの状態は持ち越される。場面が本当に変わるときだけ
  次のステップで `@hide *` を検討する

### 6. 演出の仮提案

原稿の描写から、次の命令を仮挿入する。すべて `docs/script-syntax.md` の「命令一覧」節にある構文に従う。

| 手がかり | 命令 |
|---|---|
| 場所の描写・場面転換 | `@bg <名前>` |
| 人物の登場描写 | `@show <キャラ> [表情] [pos:<位置>]` |
| 人物の退場描写 | `@hide <キャラ>` |
| 回想への言及 | `@flashback on` 〜 `@flashback off` |
| 間・沈黙の描写 | `@wait <ms>` |

- 背景名・キャラ名は原稿から拾えるローマ字や英語の識別子がなければ、日本語の説明的な名前を仮に付ける
  （例: `@bg 部室`）。実素材の用意はこのスキルのスコープ外なので、名前が実際の素材と
  一致するかは人間が後で確認する
- 確信度が低い箇所（この命令を入れるべきか判断が割れる、名前の選び方に自信がない等）は、
  該当行の直前に `# TODO: <具体的な問い>?` を残す。TODOは疑問文の形にし、
  何を確認してほしいかが一文で分かるようにする
- `@speed` と `@flashback` は明示的に戻すまで持続する。回想が終わったら
  `@flashback off` を書き忘れないこと

### 7. 作品メタ

`@title` と `@protagonist` を台本の先頭に書く。

- 原稿にタイトルの記載がなければユーザーに確認する
- 主人公の表示名も原稿から拾えなければユーザーに確認する
- 確認が取れたら `novels/<作品ID>/index.html` の `<title>` タグも
  スキャフォールド時点の仮の値（作品ID）から実際のタイトルへ更新する

### 8. 自己検証

\`\`\`bash
node tools/wn-compile/validate.ts novels/<作品ID>/script.wn
\`\`\`

- `OK: ...` が出るまで、構文エラー・シーン名重複を自分で直して再実行する
  （このコマンドは構文とシーン名の一意性だけを見る。素材の実在は見ない）
- 3回試して直らない場合は、エラーメッセージをそのまま人間に見せて判断を仰ぐ

### 9. レビュー依頼

以下を人間に報告して終了する。**コミットはしない。**

- 生成した `novels/<作品ID>/script.wn` のパス
- `# TODO:` コメントの一覧（該当行番号つき）
- 挿入した `@bg` / `@show` / `@bgm` / `@se` の名前一覧（素材をこれから用意する対象として）
- `NOVEL=<作品ID> npm run build` はまだ通らない場合がある旨（`public/` が空のため、
  参照した素材名のファイルを置くまで `素材が見つからない` エラーになる。これは想定内で、
  TODO一覧の素材名がそのまま「用意すべきファイル」になる）

## Common Mistakes

| 問題 | 対処 |
|---|---|
| `# TODO:` を疑問文でなく断定で書いてしまう | 人間が何を判断すればいいか分からなくなる。必ず「〜か?」の形にする |
| 話者不明の発話に空の `>` を使ってしまう | `>`（引数なし）は「話者を伏せる」という別の意味になる。不明なら仮の名前 + TODO にする |
| `@flashback on` の戻し忘れ | 台本の最後まで効き続ける。回想の終わりを見つけたら必ず `off` を対にする |
| シーン名を短すぎる/汎用的な名前にする | 一意性違反で自己検証が失敗しやすくなる。「場所・時間帯」で具体化する |
| 自己検証を素材エラーで止めてしまう | `素材が見つからない` は想定内の停止理由。構文エラーとは区別し、TODO一覧に回す |
```

- [ ] **Step 2: 短いサンプル原稿で手動ドライランする**

一時ファイルとして次のサンプルを用意する。

```text
放課後の部室には、埃っぽい匂いが漂っていた。
「今日はもう帰ろうかな」とミカが言った。
窓の外では夕陽が沈みかけている。
```

これを渡して `/novel-to-wn <一時ファイルのパス> zz-dryrun` を実行し、以下を確認する。

- `novels/zz-dryrun/` が Task 1 のスキャフォールドどおり作られる
- `script.wn` に `>ミカ` が挿入されている（地の文の「ミカが言った」から話者を拾えている）
- `node tools/wn-compile/validate.ts novels/zz-dryrun/script.wn` が `OK` を返す
- 演出（`@bg` 等）を仮挿入した箇所に、疑問文形式の `# TODO:` が付いている

確認後、`novels/zz-dryrun/` を削除する。

- [ ] **Step 3: 差分を提示し、確認を得てからコミットする**

`.claude/skills/novel-to-wn/SKILL.md` の diff を人間に提示し、承認を得てから:

```bash
git add .claude/skills/novel-to-wn/SKILL.md
git commit -m "feat: 原稿からwnへの変換スキルnovel-to-wnを追加する"
```

---

## Task 4: `docs/status.md` の更新

**Files:**
- Modify: `docs/status.md`

**Interfaces:**
- Consumes: Task 1〜3 で追加した `tools/scaffold-novel/`、`tools/wn-compile/validate.ts`、
  `.claude/skills/novel-to-wn/SKILL.md`
- Produces: なし（ドキュメントのみ）

- [ ] **Step 1: 「現在地」に追記する**

`docs/status.md` の「## 現在地」内、縦持ちレイアウトの段落の直後に追記する。

```markdown

**2作目の原稿を `.wn` に変換する支援として `novel-to-wn` スキルを追加した。**
`.claude/skills/novel-to-wn/`（変換ワークフロー本体）、`tools/scaffold-novel/`
（作品ディレクトリの雛形作成）、`tools/wn-compile/validate.ts`（構文とシーン名一意性の
自己検証）が土台。設計は
[原稿からwnへの変換スキル 設計](superpowers/specs/2026-08-12-novel-to-wn-design.md)。
**実際の2作目原稿での実地検証はまだ。**
```

- [ ] **Step 2: 「次のセッションで最初にやること」に追記する**

同ファイルの「### 次のセッションで最初にやること」の箇条書きに追加する。

```markdown
- `novel-to-wn` スキルを実際の2作目原稿で試す（`/novel-to-wn <原稿パス> <作品ID>`）。
  実地検証はまだ
```

- [ ] **Step 3: 差分を提示し、確認を得てからコミットする**

`docs/status.md` の diff を人間に提示し、承認を得てから:

```bash
git add docs/status.md
git commit -m "docs: novel-to-wnスキルの追加をstatusに反映する"
```

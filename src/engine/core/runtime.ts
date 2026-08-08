import type { CompiledScript, Step } from './script.ts'
import { DEFAULT_SETTINGS, charDelayMs, type Settings } from './settings.ts'
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
  private settings: Settings = DEFAULT_SETTINGS
  /** 文字送りを打ち切って全文表示するためのフラグ */
  private skipTyping = false

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
    return () => {
      this.listeners.delete(fn)
    }
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

  setSettings(s: Settings): void {
    this.settings = s
  }

  getSettings(): Settings {
    return this.settings
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
      case 'bg':
        // 状態を先に更新してから待つ。UI は新しい背景を fadeMs 付きで描き始め、
        // コアはその時間だけ止まる。transitionend は見ない
        this.state.snapshot.bg = step.name
        this.emit()
        await this.perform(step.fade)
        break
      case 'show': {
        // 配列は mutate しない。emit() は3層を浅くコピーするだけなので、
        // 中身を書き換えると参照が変わらず購読側から見て変化しない
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

      default:
        // 残りの演出命令は Task 11 以降で足す
        break
    }
  }

  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    this.state.progress.index = step.i
    this.state.view.currentText = { speaker: step.speaker, body: step.body }
    this.state.view.visibleChars = 0
    this.emit()
    await this.type(step.body)
    await this.waitForClick()
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

  /**
   * クリック待ち。ここが唯一のセーブ可能点。
   * リプレイ中は待たずに素通りする（これがリプレイ専用分岐の1つ目）。
   */
  protected waitForClick(): Promise<void> {
    if (this.replaying) return Promise.resolve()
    this.state.view.phase = 'waiting'
    this.emit()
    this.onSaveable?.()
    return new Promise<void>((resolve) => {
      this.clickResolve = resolve
    })
  }

  /**
   * 演出の待ち。時間の権威はここにあり、CSS は view.fadeMs を受け取るだけ。
   * リプレイ中は待たない（これがリプレイ専用分岐の2つ目）。
   *
   * transitionend は使わない。発火が保証されず、描画を伴わないリプレイでも検知できないため。
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
}

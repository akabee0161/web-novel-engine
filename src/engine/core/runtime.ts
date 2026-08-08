import { nullAudio, type AudioPort } from './audio.ts'
import { Backlog } from './backlog.ts'
import { ReadSet } from './read.ts'
import { LoadError, parseSave, serializeSave, type SaveData, type SaveMeta } from './save.ts'
import type { CompiledScript, Step } from './script.ts'
import { charDelayMs, type Settings } from './settings.ts'
import { initialState, type EngineState, type Snapshot } from './state.ts'
import { SystemStore, memoryStorage, saveKey, type Storage } from './storage.ts'

export type RuntimeOptions = {
  script: CompiledScript
  novelId: string
  /** 素材の相対パスを解決する基準。UI 層が document.baseURI を渡す */
  baseUrl: string
  /** セーブ可能点に到達するたびに呼ばれる（オートセーブ用） */
  onSaveable?: () => void
  /** 省略時は何もしない実装。コアが DOM/Web Audio に直接触らないための注ぎ口 */
  audio?: AudioPort
  /** 省略時はインメモリ。UI 層が localStorage 実装を渡す */
  storage?: Storage
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** @flashback の切替にかける時間。台本に引数がないのでエンジン側の定数。style.css と揃える */
const FLASHBACK_FADE_MS = 600

export class Runtime {
  readonly script: CompiledScript
  readonly novelId: string
  private readonly baseUrl: string
  private readonly onSaveable?: () => void
  protected readonly audio: AudioPort
  protected readonly storage: Storage
  protected readonly system: SystemStore
  protected readonly read: ReadSet
  protected readonly backlog = new Backlog()

  private state: EngineState
  private listeners = new Set<() => void>()
  private clickResolve: (() => void) | null = null
  private settings: Settings
  /** 文字送りを打ち切って全文表示するためのフラグ */
  private skipTyping = false
  /** 進行中の perform() の待ちを打ち切る。待っていないときは null */
  private performCancel: (() => void) | null = null

  /** リプレイ中は待ち時間を一切消費しない */
  protected replaying = false
  /** リプレイの終了地点。この連番の本文に到達したら通常再生に戻る */
  private replayTarget = -1
  /**
   * 実行中の再生ループの世代。ロードで打ち切るために使う。
   * 増やしただけでは古いループは待ちの中で止まったままなので、
   * 打ち切る側が待ちも解くこと（`abortRun()`）。
   */
  private generation = 0
  private readonly slots = ['auto', '1', '2', '3'] as const
  /** シーン入口のスナップショット。セーブはこれを書き出す */
  protected sceneEntry: Snapshot
  protected sceneIdx = 0

  constructor(opts: RuntimeOptions) {
    this.script = opts.script
    this.novelId = opts.novelId
    this.baseUrl = opts.baseUrl
    this.onSaveable = opts.onSaveable
    this.audio = opts.audio ?? nullAudio
    // storage は1つだけ作ってフィールドに持つ。使う場所ごとに memoryStorage() を呼ぶと
    // 別インスタンスになり、セーブとシステムデータが別の入れ物に入る
    this.storage = opts.storage ?? memoryStorage()
    this.system = new SystemStore(this.storage, opts.novelId)
    const data = this.system.load()
    this.read = new ReadSet(data.read)
    this.settings = data.settings
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
    this.audio.setVolumes(s.volume)
    // 設定変更は数が少なく、次の起動に残らないと読者が困る。ここだけは即座に書き出す
    this.system.save({ read: this.read.toArray(), settings: s })
    this.emit()
  }

  /** バックログ・セーブ UI を開いてよいか。セーブ可能点とまったく同じ条件 */
  canOpenUi(): boolean {
    return this.state.view.phase === 'waiting'
  }

  canSave(): boolean {
    return this.state.view.phase === 'waiting'
  }

  get saveSlots(): readonly string[] {
    return this.slots
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
      if (!data) continue
      list.push({
        slot,
        scene: data.scene,
        index: data.index,
        savedAt: data.savedAt,
        preview: data.preview,
      })
    }
    return list
  }

  async loadFrom(slot: string): Promise<void> {
    const data = parseSave(this.storage.get(saveKey(this.novelId, slot)))
    if (!data) throw new LoadError('セーブデータが読めない')
    await this.load({ scene: data.scene, snapshot: data.snapshot, index: data.index })
  }

  /**
   * セーブ時の画面を再現する。
   * スナップショットを復元 → 0 から index-1 までを演出スキップでリプレイ
   * → index を通常表示してクリック待ち。
   *
   * 呼べるのはクリック待ち（`canOpenUi()`）か、まだ再生を始めていないときだけ。
   * 文字送りの最中に呼ぶと、打ち切った側の文字送りが状態を上書きしうる。
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

    this.abortRun()

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

  isRead(hash: string): boolean {
    return this.read.has(hash)
  }

  /** 既読をストレージへ書き出す。前回の書き出し以降に追加が無ければ何もしない */
  flushSystem(): void {
    const read = this.read.takeDirty()
    if (!read) return
    this.system.save({ read, settings: this.settings })
  }

  /** タイトル画面のボタンハンドラから同期的に呼ぶこと */
  unlockAudio(): void {
    this.audio.unlock()
    this.audio.setVolumes(this.settings.volume)
  }

  resumeAudio(): void {
    this.audio.resumeIfSuspended()
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
    const gen = ++this.generation
    for (let s = sceneIdx; s < this.script.scenes.length; s++) {
      const scene = this.script.scenes[s]
      this.sceneIdx = s
      if (s !== sceneIdx || pc === 0) this.enterScene(scene.id)
      for (let p = s === sceneIdx ? pc : 0; p < scene.steps.length; p++) {
        this.state.progress.pc = p
        await this.exec(scene.steps[p])
        // ロードで別の再生が始まっていたら、ここで黙って降りる
        if (gen !== this.generation) return
      }
    }
    this.state.view.phase = 'ended'
    this.emit()
  }

  /**
   * 走っている再生ループを打ち切る。
   * 世代を進めたうえで待ちを解き、古いループが `runFrom` の判定まで進めるようにする。
   */
  private abortRun(): void {
    this.generation++
    const click = this.clickResolve
    this.clickResolve = null
    click?.()
    const cancel = this.performCancel
    this.performCancel = null
    cancel?.()
  }

  /** シーンに入った瞬間の状態を控える。ここがセーブの復元起点になる */
  private enterScene(sceneId: string): void {
    this.state.progress.scene = sceneId
    this.state.progress.index = 0
    this.sceneEntry = structuredClone(this.state.snapshot)
    this.emit()
  }

  protected async exec(step: Step): Promise<void> {
    if (this.replaying && step.t === 'text' && step.i === this.replayTarget) {
      // ここから通常再生。この本文は文字送りされ、クリック待ちになる
      this.replaying = false
      // リプレイ中は state だけ動かしていたので、実際の再生をここで1度だけ合わせる
      this.audio.syncBgm(this.state.snapshot.bgm, 0)
    }
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

      case 'wait':
        await this.perform(step.ms)
        break

      case 'speed':
        // 瞬時に効くので待たない
        this.state.snapshot.speed = step.value
        this.emit()
        break

      case 'flashback':
        this.state.snapshot.flashback = step.on
        this.emit()
        await this.perform(FLASHBACK_FADE_MS)
        break

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
    }
  }

  private async execText(step: Extract<Step, { t: 'text' }>): Promise<void> {
    // セーブ操作とは無関係に、本文を表示した瞬間に記録する
    this.read.add(step.h)
    // バックログはシーン境界でクリアしない（enterScene に手を入れないこと）。
    // entries() は毎回新しい配列なので、購読側から見て参照が変わる
    this.backlog.push({ speaker: step.speaker, body: step.body })
    this.state.view.backlog = this.backlog.entries()
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
  protected perform(ms: number): Promise<void> {
    if (this.replaying || ms <= 0) return Promise.resolve()
    this.state.view.phase = 'performing'
    this.state.view.fadeMs = ms
    this.emit()
    return new Promise<void>((resolve) => {
      const done = () => {
        this.performCancel = null
        resolve()
      }
      const timer = setTimeout(done, ms)
      // 読者のクリックで、この待ちだけを打ち切れるようにする
      this.performCancel = () => {
        clearTimeout(timer)
        done()
      }
    })
  }

  /** 読者のクリック */
  advance(): void {
    // 文字送り中のクリックは、全文を表示して止める（次には進まない）
    if (this.state.view.phase === 'typing') {
      this.skipTyping = true
      return
    }
    // 演出中のクリックは、進行中の待ちだけを打ち切る。
    // 次の本文ブロックには進めないので、連打すると待ちを1つずつ飛ばすことになる
    if (this.state.view.phase === 'performing') {
      const cancel = this.performCancel
      this.performCancel = null
      cancel?.()
      return
    }
    if (this.state.view.phase !== 'waiting') return
    const resolve = this.clickResolve
    this.clickResolve = null
    resolve?.()
  }
}

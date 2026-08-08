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

/**
 * `<audio>` 要素は使わない。iOS Safari が `HTMLMediaElement.volume` を無視するため、
 * `@bgm stop fade:800` が実装できない。GainNode なら確実にフェードできる。
 */
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

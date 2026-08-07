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

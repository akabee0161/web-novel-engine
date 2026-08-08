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

/** 壊れたデータを黙って通さない */
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

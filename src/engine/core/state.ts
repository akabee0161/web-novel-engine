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
 * ended      台本の終端に到達した（セーブ可能点ではない）
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
    /** ページの測定をどこから始めるか。回転前に読み終えた分は測り直さない */
    measureFrom: number
    /** ページの先頭文字位置。[0] は常に 0。UI が測定して渡す */
    pageBreaks: number[]
    page: { current: number; total: number }
    /** 進行中の演出の所要時間。CSS の transition-duration に渡す */
    fadeMs: number
    backlog: BacklogEntry[]
  }
}

/**
 * 新しい状態を足すときは、必ずどの層に置くかを選ぶこと（engine-spec 不変条件4）。
 * 画面の見た目を決めて、シーンをまたいで持ち越されるなら snapshot。そうでなければ view。
 */
export function initialState(sceneId: string): EngineState {
  return {
    snapshot: { bg: null, bgm: null, sprites: [], speed: 'normal', flashback: false, vars: {} },
    progress: { scene: sceneId, index: 0, pc: 0 },
    view: {
      phase: 'performing',
      currentText: null,
      visibleChars: 0,
      measureFrom: 0,
      pageBreaks: [0],
      page: { current: 0, total: 1 },
      fadeMs: 0,
      backlog: [],
    },
  }
}

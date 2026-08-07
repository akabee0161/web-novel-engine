export type Pos = 'left' | 'center' | 'right'

export type Step =
  | { t: 'text'; i: number; h: string; speaker: string | null; body: string }
  | { t: 'bg'; name: string; fade: number }
  | { t: 'bgm'; name: string }
  | { t: 'bgmStop'; fade: number }
  | { t: 'se'; name: string }
  | { t: 'show'; id: string; expr: string | null; pos: Pos | null }
  | { t: 'hide'; id: string | null } // null は全員退場（@hide *）
  | { t: 'wait'; ms: number }
  | { t: 'speed'; value: 'slow' | 'normal' }
  | { t: 'flashback'; on: boolean }

export type Scene = {
  id: string
  steps: Step[]
}

export type CompiledScript = {
  title: string
  protagonist: string | null
  scenes: Scene[]
  /** 論理名（'bg/clubroom_day'）→ 実パス（'bg/clubroom_day.svg'） */
  assets: Record<string, string>
}

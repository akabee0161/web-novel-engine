import { DEFAULT_SETTINGS, type Settings } from './settings.ts'

/**
 * 差し替え可能なストレージ。localStorage → IndexedDB の移行のためでもあるが、
 * テストでインメモリ実装を差せることのほうが日常的に効く。
 */
export interface Storage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v) },
    remove: (k) => { map.delete(k) },
  }
}

/** localStorage 実装。UI 層から注入する（core は window を知らない） */
export function browserStorage(): Storage {
  return {
    get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v)
      } catch (e) {
        console.warn('保存に失敗した', e)
      }
    },
    remove: (k) => { try { localStorage.removeItem(k) } catch { /* 無視 */ } },
  }
}

export const systemKey = (novelId: string): string => `wn:${novelId}:system`
export const saveKey = (novelId: string, slot: string): string => `wn:${novelId}:save:${slot}`

/**
 * システムデータ。作品ごとに単一で、全セーブスロットに共通。
 * セーブスロットを削除しても既読が消えないのはこの分離による。
 */
export type SystemData = {
  read: string[]
  settings: Settings
}

export class SystemStore {
  constructor(private readonly storage: Storage, private readonly novelId: string) {}

  load(): SystemData {
    const raw = this.storage.get(systemKey(this.novelId))
    if (!raw) return { read: [], settings: DEFAULT_SETTINGS }
    try {
      const data = JSON.parse(raw) as Partial<SystemData>
      return {
        read: Array.isArray(data.read) ? data.read.filter((h) => typeof h === 'string') : [],
        // 設定は「既定値にセーブ値を上書きマージ」。項目を足しても旧データが壊れない
        settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
      }
    } catch {
      console.warn('システムデータが壊れているため既定値で起動する')
      return { read: [], settings: DEFAULT_SETTINGS }
    }
  }

  save(data: SystemData): void {
    this.storage.set(systemKey(this.novelId), JSON.stringify(data))
  }
}

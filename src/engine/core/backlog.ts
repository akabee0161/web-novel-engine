import type { BacklogEntry } from './state.ts'

/** 保持件数。実際に読んで足りなければ増やす */
export const BACKLOG_LIMIT = 200

export class Backlog {
  private items: BacklogEntry[] = []

  push(entry: BacklogEntry): void {
    const next = [...this.items, entry]
    this.items = next.length > BACKLOG_LIMIT ? next.slice(next.length - BACKLOG_LIMIT) : next
  }

  entries(): BacklogEntry[] {
    return this.items
  }

  clear(): void {
    this.items = []
  }
}

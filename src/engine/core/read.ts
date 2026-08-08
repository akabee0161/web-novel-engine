/**
 * 既読の本文ハッシュ。シーンも位置も参照しない。
 * ハッシュはビルド時に計算済みで、実行時に計算する処理はどこにもない。
 */
export class ReadSet {
  private readonly hashes: Set<string>
  private dirty = false

  constructor(initial: readonly string[] = []) {
    this.hashes = new Set(initial)
  }

  add(hash: string): void {
    if (this.hashes.has(hash)) return
    this.hashes.add(hash)
    this.dirty = true
  }

  has(hash: string): boolean {
    return this.hashes.has(hash)
  }

  get size(): number {
    return this.hashes.size
  }

  toArray(): string[] {
    return [...this.hashes]
  }

  /** 前回の書き出し以降に追加があれば全件を返す。無ければ null */
  takeDirty(): string[] | null {
    if (!this.dirty) return null
    this.dirty = false
    return this.toArray()
  }
}

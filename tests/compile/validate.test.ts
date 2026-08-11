import { describe, expect, it } from 'vitest'
import { validateScript } from '../../tools/wn-compile/validate.ts'

describe('validateScript', () => {
  it('構文的に正しければ ok:true を返す', () => {
    const result = validateScript('= scene A\nこんにちは', 'test.wn')
    expect(result).toEqual({ ok: true })
  })

  it('シーン名が重複していれば ok:false とエラーメッセージを返す', () => {
    const result = validateScript('= scene A\nテキスト\n= scene A\nテキスト2', 'test.wn')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('test.wn:3: シーン名が重複している: A')
  })

  it('未知の命令はエラーにする', () => {
    const result = validateScript('@bgx 何か', 'test.wn')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toBe('test.wn:1: 未知の命令: @bgx')
  })

  it('素材の実在は検査しない（フル compile() と違う）', () => {
    const result = validateScript('= scene A\n@bg 存在しない背景', 'test.wn')
    expect(result).toEqual({ ok: true })
  })
})

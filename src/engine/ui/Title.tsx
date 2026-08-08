type Props = {
  title: string
  hasSave: boolean
  onStart: () => void
  onContinue: () => void
  onSettings: () => void
}

export function Title({ title, hasSave, onStart, onContinue, onSettings }: Props) {
  return (
    <div className="wn-title">
      <h1>{title}</h1>
      <div className="wn-title-buttons">
        {/* このクリックがユーザージェスチャであり、音声の解禁点になる（Task 12） */}
        <button className="wn-button" onClick={onStart}>はじめから</button>
        <button className="wn-button" onClick={onContinue} disabled={!hasSave}>つづきから</button>
        {/* 読み始める前に音量と文字送りを決めたい読者のため、ここからも開ける */}
        <button className="wn-button" onClick={onSettings}>設定</button>
      </div>
    </div>
  )
}

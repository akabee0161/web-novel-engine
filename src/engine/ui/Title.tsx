type Props = {
  title: string
  onStart: () => void
}

export function Title({ title, onStart }: Props) {
  return (
    <div className="wn-title">
      <h1>{title}</h1>
      <div className="wn-title-buttons">
        {/* このクリックがユーザージェスチャであり、後で音声の解禁点になる（Task 12） */}
        <button className="wn-button" onClick={onStart}>はじめから</button>
        {/* Task 15（セーブ）で有効化する */}
        <button className="wn-button" disabled>つづきから</button>
      </div>
    </div>
  )
}

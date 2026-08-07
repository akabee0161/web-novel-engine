import { useState } from 'react'
import type { Runtime } from '../core/runtime.ts'
import { MessageBox } from './MessageBox.tsx'
import { Title } from './Title.tsx'
import { useEngine } from './useEngine.ts'

export function App({ runtime }: { runtime: Runtime }) {
  // 「タイトル画面か本編か」はエンジンの状態ではなく画面の状態なので useState でよい
  const [started, setStarted] = useState(false)
  const state = useEngine(runtime)

  const start = () => {
    setStarted(true)
    void runtime.start()
  }

  return (
    <div className="wn-viewport">
      <div className="wn-stage" onClick={() => started && runtime.advance()}>
        {started
          ? <MessageBox state={state} script={runtime.script} />
          : <Title title={runtime.script.title} onStart={start} />}
      </div>
    </div>
  )
}

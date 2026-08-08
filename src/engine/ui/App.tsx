import { useState } from 'react'
import type { Runtime } from '../core/runtime.ts'
import { MessageBox } from './MessageBox.tsx'
import { Stage } from './Stage.tsx'
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
      {/* data-phase は CSS の演出フックであり、E2E が進行を決定的に待つための手掛かりでもある */}
      <div
        className="wn-stage"
        data-phase={state.view.phase}
        onClick={() => started && runtime.advance()}
      >
        {started ? (
          <>
            <Stage runtime={runtime} state={state} />
            <MessageBox state={state} script={runtime.script} />
          </>
        ) : (
          <Title title={runtime.script.title} onStart={start} />
        )}
      </div>
    </div>
  )
}

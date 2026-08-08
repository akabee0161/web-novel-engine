import { useEffect, useState } from 'react'
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
    // await を挟まず同期的に呼ぶ。挟むとユーザージェスチャの資格が切れる
    runtime.unlockAudio()
    setStarted(true)
    void runtime.start()
  }

  // タブ復帰や画面ロック明けに AudioContext が suspended へ落ちる
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') runtime.resumeAudio()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [runtime])

  return (
    <div className="wn-viewport">
      {/* data-phase は CSS の演出フックであり、E2E が進行を決定的に待つための手掛かりでもある */}
      <div
        className="wn-stage"
        data-phase={state.view.phase}
        // resume() は冪等なので、visibilitychange と両方走っても害はない
        onClick={() => {
          runtime.resumeAudio()
          if (started) runtime.advance()
        }}
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

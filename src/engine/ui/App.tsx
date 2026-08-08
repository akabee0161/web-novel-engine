import { useEffect, useState } from 'react'
import type { Runtime } from '../core/runtime.ts'
import { Backlog } from './Backlog.tsx'
import { MessageBox } from './MessageBox.tsx'
import { SaveMenu } from './SaveMenu.tsx'
import { Settings } from './Settings.tsx'
import { Stage } from './Stage.tsx'
import { Title } from './Title.tsx'
import { useEngine } from './useEngine.ts'

type Ui = 'none' | 'backlog' | 'save' | 'load' | 'settings'

export function App({ runtime }: { runtime: Runtime }) {
  // 「タイトル画面か本編か」はエンジンの状態ではなく画面の状態なので useState でよい
  const [started, setStarted] = useState(false)
  // 開いている UI も画面の状態。エンジンの状態ではないので useState でよい
  const [ui, setUi] = useState<Ui>('none')
  const state = useEngine(runtime)

  const start = () => {
    // await を挟まず同期的に呼ぶ。挟むとユーザージェスチャの資格が切れる
    runtime.unlockAudio()
    setStarted(true)
    void runtime.start()
  }

  // 「つづきから」はタイトル画面のままロードメニューを開く。
  // 先に本編へ切り替えると、スロットを選ばずに閉じたとき戻る先が無くなる
  const continueGame = () => {
    runtime.unlockAudio()
    setUi('load')
  }

  const pickSlot = (slot: string) => {
    setUi('none')
    if (ui === 'save') {
      runtime.saveTo(slot)
      return
    }
    setStarted(true)
    // loadFrom は台本の終端まで解決しない。ここで捕まえられるのは復元の失敗だけ
    void runtime.loadFrom(slot).catch((e: unknown) => {
      setStarted(false)
      alert(e instanceof Error ? e.message : String(e))
    })
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
            <MessageBox runtime={runtime} state={state} />
            {/* 演出中・文字送り中は導線ごと出さない。開ける条件はセーブ可能点と同じ */}
            {ui === 'none' && runtime.canOpenUi() && (
              <div className="wn-corner" onClick={(e) => e.stopPropagation()}>
                <button className="wn-button" onClick={() => setUi('backlog')}>履歴</button>
                <button className="wn-button" onClick={() => setUi('save')}>セーブ</button>
                <button className="wn-button" onClick={() => setUi('load')}>ロード</button>
                <button className="wn-button" onClick={() => setUi('settings')}>設定</button>
              </div>
            )}
          </>
        ) : (
          <Title
            title={runtime.script.title}
            hasSave={runtime.listSaves().length > 0}
            onStart={start}
            onContinue={continueGame}
            onSettings={() => setUi('settings')}
          />
        )}
        {ui === 'settings' && <Settings runtime={runtime} onClose={() => setUi('none')} />}
        {ui === 'backlog' && (
          <Backlog
            entries={state.view.backlog}
            script={runtime.script}
            onClose={() => setUi('none')}
          />
        )}
        {(ui === 'save' || ui === 'load') && (
          <SaveMenu
            mode={ui}
            slots={runtime.saveSlots}
            saves={runtime.listSaves()}
            onPick={pickSlot}
            onClose={() => setUi('none')}
          />
        )}
      </div>
    </div>
  )
}

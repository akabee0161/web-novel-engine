import { useSyncExternalStore } from 'react'
import type { Runtime } from '../core/runtime.ts'
import type { EngineState } from '../core/state.ts'

export function useEngine(runtime: Runtime): EngineState {
  // 第3引数はサーバ用スナップショット。SSR しないので getState をそのまま渡す
  return useSyncExternalStore(runtime.subscribe, runtime.getState, runtime.getState)
}

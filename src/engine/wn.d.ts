declare module '*.wn' {
  import type { CompiledScript } from './core/script.ts'
  const script: CompiledScript
  export default script
}

export interface WorkbookLineResult {
  display: string
  isError: boolean
}

export interface WorkbookEvaluation {
  results: WorkbookLineResult[]
  total: string
}

export interface CalculatorExports {
  EvaluateWorkbook(source: string): string
}

declare global {
  var numEngine: CalculatorExports | undefined
  var numEngineReady: Promise<CalculatorExports> | undefined
}

let enginePromise: Promise<CalculatorExports> | undefined

async function loadEngine(): Promise<CalculatorExports> {
  if (!enginePromise) {
    const ready = globalThis.numEngineReady ?? new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The WebAssembly module did not load.')), 10000)
      globalThis.addEventListener('numengine:ready', () => {
        window.clearTimeout(timeout)
        resolve()
      }, { once: true })
    })

    enginePromise = Promise.resolve(ready).then(() => {
      const engine = globalThis.numEngine
      if (!engine?.EvaluateWorkbook) {
        throw new Error('The WebAssembly calculator did not start.')
      }
      return engine
    })
  }
  return enginePromise
}

export async function evaluateWorkbook(source: string): Promise<WorkbookEvaluation> {
  const engine = await loadEngine()
  return JSON.parse(engine.EvaluateWorkbook(source)) as WorkbookEvaluation
}

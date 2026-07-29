let enginePromise

async function loadEngine() {
  if (!enginePromise) {
    const ready = globalThis.numEngineReady ?? new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The WebAssembly module did not load.')), 10000)
      globalThis.addEventListener('numengine:ready', () => {
        window.clearTimeout(timeout)
        resolve()
      }, { once: true })
    })

    enginePromise = Promise.resolve(ready).then(() => {
      if (!globalThis.numEngine?.EvaluateWorkbook) {
        throw new Error('The WebAssembly calculator did not start.')
      }
      return globalThis.numEngine
    })
  }
  return enginePromise
}

export async function evaluateWorkbook(source) {
  const engine = await loadEngine()
  return JSON.parse(engine.EvaluateWorkbook(source))
}

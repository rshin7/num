type CalculatorExports = {
  EvaluateWorkbook(source: string): string
}

type DotnetRuntime = {
  getAssemblyExports(mainAssemblyName: string): Promise<Record<string, unknown>>
  getConfig(): { mainAssemblyName: string }
}

type DotnetLoader = {
  create(): Promise<DotnetRuntime>
}

type NumGlobal = typeof globalThis & {
  numEngine?: CalculatorExports
  numEngineReady?: Promise<CalculatorExports>
}

const numGlobal = globalThis as NumGlobal

numGlobal.numEngineReady = (async (): Promise<CalculatorExports> => {
  // The .NET build writes this runtime alongside the compiled bootstrap.
  // @ts-expect-error This module is generated during the .NET build.
  const runtimeModule = await import('./_framework/dotnet.js') as { dotnet: DotnetLoader }
  const runtime = await runtimeModule.dotnet.create()
  const exports = await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)
  const calculator = (exports.NumEngine as { CalculatorExports: CalculatorExports }).CalculatorExports

  numGlobal.numEngine = calculator
  numGlobal.dispatchEvent?.(new Event('numengine:ready'))
  return calculator
})()

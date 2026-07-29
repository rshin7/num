globalThis.numEngineReady = (async () => {
  const { dotnet } = await import('./_framework/dotnet.js');
  const { getAssemblyExports, getConfig } = await dotnet.create();
  const exports = await getAssemblyExports(getConfig().mainAssemblyName);
  globalThis.numEngine = exports.NumEngine.CalculatorExports;
  globalThis.dispatchEvent?.(new Event('numengine:ready'));
  return globalThis.numEngine;
})();

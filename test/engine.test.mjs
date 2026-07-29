import assert from 'node:assert/strict'
import test from 'node:test'

await import(new URL('../public/wasm/main.js', import.meta.url))
await globalThis.numEngineReady

function evaluate(source) {
  return JSON.parse(globalThis.numEngine.EvaluateWorkbook(source))
}

test('calculates money with decimal precision and variables', () => {
  const workbook = evaluate('meal = $18.45\nmeal * 3\n$2.30 + $4.70')

  assert.deepEqual(workbook.results.map((result) => result.display), ['$18.45', '$55.35', '$7'])
  assert.equal(workbook.total, '$62.35')
})

test('supports parentheses, percentages, and built-in functions', () => {
  const workbook = evaluate('round(8.875%, 3)\nmin(12, 5, 9)\n(1,000 + 250) / 5')

  assert.deepEqual(workbook.results.map((result) => result.display), ['0.089', '5', '250'])
  assert.equal(workbook.total, '255.089')
})

test('ignores comment-only rows and reports invalid arithmetic per row', () => {
  const workbook = evaluate('# planned expense\n$10 + €2\n20 / 0')

  assert.equal(workbook.results[0].display, '')
  assert.equal(workbook.results[1].isError, true)
  assert.match(workbook.results[1].display, /Currencies don't match/)
  assert.equal(workbook.results[2].isError, true)
  assert.match(workbook.results[2].display, /Can't divide by zero/)
  assert.equal(workbook.total, '0')
})

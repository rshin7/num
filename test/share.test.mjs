import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.window = { location: { href: 'https://num.example/' } }

const { readSharedSource, shareUrl, sourceFromWorkbookJson } = await import('../src/share.js')

test('round-trips a workbook through the compressed share fragment', () => {
  const source = 'coffee = $4.50\ncoffee * 2 # morning and afternoon'
  const url = new URL(shareUrl(source))

  assert.match(url.hash, /^#n=/)
  window.location.hash = url.hash
  assert.equal(readSharedSource(), source)
})

test('imports a valid exported workbook', () => {
  const source = 'income = $3,500\nincome - $1,450 # rent'
  assert.equal(sourceFromWorkbookJson(JSON.stringify({ version: 1, source })), source)
})

test('rejects malformed and incompatible workbook imports', () => {
  assert.throws(() => sourceFromWorkbookJson('{bad json'), /valid Num workbook/)
  assert.throws(() => sourceFromWorkbookJson(JSON.stringify({ version: 2, source: '' })), /unsupported version/)
  assert.throws(() => sourceFromWorkbookJson(JSON.stringify({ version: 1 })), /no calculator source/)
})

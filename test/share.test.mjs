import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.window = { location: { href: 'https://num.example/' } }

const { readSharedSource, shareUrl } = await import('../src/share.js')

test('round-trips a workbook through the compressed share fragment', () => {
  const source = 'coffee = $4.50\ncoffee * 2 # morning and afternoon'
  const url = new URL(shareUrl(source))

  assert.match(url.hash, /^#n=/)
  window.location.hash = url.hash
  assert.equal(readSharedSource(), source)
})

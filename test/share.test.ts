import assert from 'node:assert/strict'
import test from 'node:test'

const location = { href: 'https://num.example/', hash: '' }
const replacedUrls: string[] = []

globalThis.window = {
  location,
  history: {
    state: null,
    replaceState(_state: unknown, _title: string, url: string | URL | null) {
      const nextUrl = String(url)
      replacedUrls.push(nextUrl)
      location.href = nextUrl
      location.hash = new URL(nextUrl).hash
    },
  },
} as unknown as Window & typeof globalThis

const { readSharedSource, replaceUrlForSource, shareUrl } = await import('../src/share')

test('round-trips a workbook through the compressed share fragment', () => {
  const source = 'coffee = $4.50\ncoffee * 2 # morning and afternoon'
  const url = new URL(shareUrl(source))

  assert.match(url.hash, /^#n=/)
  window.location.hash = url.hash
  assert.equal(readSharedSource(), source)
})

test('replaces the current URL instead of adding a history entry', () => {
  const url = replaceUrlForSource('12 * 4')

  assert.equal(replacedUrls.at(-1), url)
  assert.match(new URL(url).hash, /^#n=/)
  assert.equal(replaceUrlForSource(''), 'https://num.example/')
  assert.equal(replacedUrls.at(-1), 'https://num.example/')
})

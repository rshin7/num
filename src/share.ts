import LZString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString

const HASH_KEY = 'n='

export function readSharedSource(): string | null {
  const hash = window.location.hash.slice(1)
  if (!hash.startsWith(HASH_KEY)) return null

  try {
    return decompressFromEncodedURIComponent(hash.slice(HASH_KEY.length)) || null
  } catch {
    return null
  }
}

export function shareUrl(source: string): string {
  const url = new URL(window.location.href)
  url.hash = source ? HASH_KEY + compressToEncodedURIComponent(source) : ''
  return url.toString()
}

export function replaceUrlForSource(source: string): string {
  const url = shareUrl(source)
  if (url !== window.location.href) {
    window.history.replaceState(window.history.state, '', url)
  }
  return url
}

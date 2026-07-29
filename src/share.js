import LZString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString

const HASH_KEY = 'n='

export function readSharedSource() {
  const hash = window.location.hash.slice(1)
  if (!hash.startsWith(HASH_KEY)) return null

  try {
    return decompressFromEncodedURIComponent(hash.slice(HASH_KEY.length)) || null
  } catch {
    return null
  }
}

export function shareUrl(source) {
  const url = new URL(window.location.href)
  url.hash = HASH_KEY + compressToEncodedURIComponent(source)
  return url.toString()
}

export function exportWorkbook(source) {
  const file = new Blob([JSON.stringify({ version: 1, source }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'num-workbook.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

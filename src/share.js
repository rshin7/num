import LZString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString

const HASH_KEY = 'n='
const WORKBOOK_VERSION = 1

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
  const file = new Blob([JSON.stringify({ version: WORKBOOK_VERSION, source }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'num-workbook.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function sourceFromWorkbookJson(json) {
  let workbook

  try {
    workbook = JSON.parse(json)
  } catch {
    throw new Error('Choose a valid Num workbook JSON file.')
  }

  if (!workbook || Array.isArray(workbook) || typeof workbook !== 'object') {
    throw new Error('Choose a valid Num workbook JSON file.')
  }

  if (workbook.version !== WORKBOOK_VERSION) {
    throw new Error('This workbook uses an unsupported version.')
  }

  if (typeof workbook.source !== 'string') {
    throw new Error('This workbook has no calculator source.')
  }

  return workbook.source
}

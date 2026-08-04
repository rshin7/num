import LZString from 'lz-string'

const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZString

const HASH_KEY = 'n='
const WORKBOOK_VERSION = 1

export interface WorkbookExport {
  version: number
  source: string
}

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

export function exportWorkbook(source: string): void {
  const workbook: WorkbookExport = { version: WORKBOOK_VERSION, source }
  const file = new Blob([JSON.stringify(workbook, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'num-workbook.json'
  anchor.click()
  URL.revokeObjectURL(url)
}

export function sourceFromWorkbookJson(json: string): string {
  let workbook: unknown

  try {
    workbook = JSON.parse(json)
  } catch {
    throw new Error('Choose a valid Num workbook JSON file.')
  }

  if (!workbook || Array.isArray(workbook) || typeof workbook !== 'object') {
    throw new Error('Choose a valid Num workbook JSON file.')
  }

  const exportedWorkbook = workbook as Partial<WorkbookExport>
  if (exportedWorkbook.version !== WORKBOOK_VERSION) {
    throw new Error('This workbook uses an unsupported version.')
  }

  if (typeof exportedWorkbook.source !== 'string') {
    throw new Error('This workbook has no calculator source.')
  }

  return exportedWorkbook.source
}

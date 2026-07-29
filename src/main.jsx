import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { evaluateWorkbook } from './engine'
import { exportWorkbook, readSharedSource, shareUrl, sourceFromWorkbookJson } from './share'
import './styles.css'

const STORAGE_KEY = 'num:workbook:v2'
const MAX_IMPORT_BYTES = 1_000_000

function initialSource() {
  return readSharedSource() ?? localStorage.getItem(STORAGE_KEY) ?? ''
}

function highlight(source) {
  const lines = source.split('\n')
  return lines.map((line, index) => {
    const comment = line.indexOf('#')
    const expression = comment === -1 ? line : line.slice(0, comment)
    const note = comment === -1 ? '' : line.slice(comment)
    return (
      <span className="highlight-line" key={index}>
        <span className="expression">{expression || '\u200b'}</span>
        {note && <span className="comment">{note}</span>}
        {index < lines.length - 1 ? '\n' : ''}
      </span>
    )
  })
}

function App() {
  const [source, setSource] = useState(initialSource)
  const [workbook, setWorkbook] = useState({ results: [], total: '0' })
  const [shareState, setShareState] = useState('')
  const [importState, setImportState] = useState('')
  const appShellRef = useRef(null)
  const editorRef = useRef(null)
  const fileInputRef = useRef(null)
  const importTimerRef = useRef(null)
  const overlayRef = useRef(null)
  const resultsRef = useRef(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined

    const updateViewportHeight = () => {
      appShellRef.current?.style.setProperty('--visual-viewport-height', `${Math.round(viewport.height)}px`)
    }

    updateViewportHeight()
    viewport.addEventListener('resize', updateViewportHeight)
    viewport.addEventListener('scroll', updateViewportHeight)
    return () => {
      viewport.removeEventListener('resize', updateViewportHeight)
      viewport.removeEventListener('scroll', updateViewportHeight)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(importTimerRef.current), [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, source)
    let disposed = false
    evaluateWorkbook(source)
      .then((next) => {
        if (!disposed) {
          setWorkbook(next)
        }
      })
      .catch(() => {})
    return () => { disposed = true }
  }, [source])

  const lines = useMemo(() => source.split('\n'), [source])

  function syncScroll(event) {
    const { scrollLeft, scrollTop } = event.currentTarget
    if (overlayRef.current) {
      overlayRef.current.scrollTop = scrollTop
      overlayRef.current.scrollLeft = scrollLeft
    }
    if (resultsRef.current) {
      resultsRef.current.scrollTop = scrollTop
    }
  }

  async function copyShareLink() {
    const url = shareUrl(source)
    try {
      await navigator.clipboard.writeText(url)
      setShareState(`Link copied · ${url.length} characters`)
    } catch {
      window.prompt('Copy this local-only share link:', url)
      setShareState('Share link ready')
    }
  }

  function showImportState(nextState) {
    window.clearTimeout(importTimerRef.current)
    setImportState(nextState)
    importTimerRef.current = window.setTimeout(() => setImportState(''), 2200)
  }

  function openImportPicker() {
    fileInputRef.current?.click()
  }

  async function importWorkbook(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error('This workbook is too large to import.')
      }

      const importedSource = sourceFromWorkbookJson(await file.text())
      setSource(importedSource)
      setShareState('')
      editorRef.current?.scrollTo(0, 0)
      overlayRef.current?.scrollTo(0, 0)
      resultsRef.current?.scrollTo(0, 0)
      showImportState('done')
    } catch (error) {
      showImportState('error')
      setShareState(error instanceof Error ? error.message : 'Could not import workbook.')
    }
  }

  return (
    <main className="app-shell" ref={appShellRef}>
      <nav className="actions" aria-label="Workbook actions">
        <input className="visually-hidden" ref={fileInputRef} type="file" accept="application/json,.json" onChange={importWorkbook} />
        <button
          className={`button icon import${importState ? ` ${importState}` : ''}`}
          onClick={openImportPicker}
          aria-label={importState === 'error' ? 'Import failed. Try another workbook.' : 'Import workbook'}
          title="Import workbook"
        >{importState === 'done' ? '✓' : importState === 'error' ? '!' : '↑'}</button>
        <button className="button icon" onClick={() => exportWorkbook(source)} aria-label="Download workbook">↓</button>
        <button className="button share" onClick={copyShareLink}>{shareState === 'Link copied' ? 'Copied' : 'Share'}</button>
      </nav>

      <section className="workspace" aria-label="Calculator workbook">
        <div className="calculator-grid">
          <section className="editor-section">
            <div className="editor-panel">
              <pre className="highlighter" ref={overlayRef} aria-hidden="true">{highlight(source)}</pre>
              <textarea
                ref={editorRef}
                aria-label="Calculator workbook"
                value={source}
                placeholder={'Start writing…\n\n25 * 4  # groceries'}
                onChange={(event) => setSource(event.target.value)}
                onScroll={syncScroll}
                spellCheck="false"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
              />
            </div>
          </section>

          <aside className="result-section">
            <output className="results" ref={resultsRef} aria-live="polite">
              {lines.map((_, index) => {
                const result = workbook.results[index]
                return <div className={result?.isError ? 'error' : ''} key={index}>{result?.display || '\u00a0'}</div>
              })}
            </output>
          </aside>
        </div>
      </section>
      <div className="floating-total" aria-live="polite"><span>Total</span><b>{workbook.total}</b></div>
      <span className="visually-hidden" aria-live="polite">{shareState || (importState === 'done' ? 'Workbook imported.' : '')}</span>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)

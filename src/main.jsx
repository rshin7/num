import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { evaluateWorkbook } from './engine'
import { exportWorkbook, readSharedSource, shareUrl } from './share'
import './styles.css'

const STORAGE_KEY = 'num:workbook:v2'

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
  const overlayRef = useRef(null)

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
    if (overlayRef.current) {
      overlayRef.current.scrollTop = event.currentTarget.scrollTop
      overlayRef.current.scrollLeft = event.currentTarget.scrollLeft
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

  return (
    <main className="app-shell">
      <nav className="actions" aria-label="Workbook actions">
        <button className="button icon" onClick={() => exportWorkbook(source)} aria-label="Download workbook">↓</button>
        <button className="button share" onClick={copyShareLink}>{shareState ? 'Copied' : 'Share'}</button>
      </nav>

      <section className="workspace" aria-label="Calculator workbook">
        <div className="calculator-grid">
          <section className="editor-section">
            <div className="editor-panel">
              <pre className="highlighter" ref={overlayRef} aria-hidden="true">{highlight(source)}</pre>
              <textarea
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
            <output className="results" aria-live="polite">
              {lines.map((_, index) => {
                const result = workbook.results[index]
                return <div className={result?.isError ? 'error' : ''} key={index}>{result?.display || '\u00a0'}</div>
              })}
            </output>
          </aside>
        </div>
      </section>
      <div className="floating-total" aria-live="polite"><span>Total</span><b>{workbook.total}</b></div>
      <span className="visually-hidden" aria-live="polite">{shareState}</span>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)

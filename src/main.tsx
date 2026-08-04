import { type ChangeEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createWorkspace, decryptWorkbook, encryptWorkbook, workspaceForGist, workspaceFromLocation, workspaceUrl, type CloudWorkspace } from './cloud'
import { evaluateWorkbook, type WorkbookEvaluation } from './engine'
import { exportWorkbook, readSharedSource, replaceUrlForSource, sourceFromWorkbookJson } from './share'
import './styles.css'

const STORAGE_KEY = 'num:workbook:v2'
const CLOUD_WORKSPACE_STORAGE_KEY = 'num:github:workspace:v1'
const MAX_IMPORT_BYTES = 1_000_000
const URL_SYNC_DELAY = 300
const CLOUD_SYNC_DELAY = 700

function initialSource(): string {
  if (readWorkspaceFromLocation()) return ''
  return readSharedSource() ?? localStorage.getItem(STORAGE_KEY) ?? ''
}

function readWorkspaceFromLocation(): CloudWorkspace | null {
  try {
    return workspaceFromLocation()
  } catch {
    return null
  }
}

function readStoredWorkspace(): CloudWorkspace | null {
  try {
    const stored = localStorage.getItem(CLOUD_WORKSPACE_STORAGE_KEY)
    if (!stored) return null
    const workspace = JSON.parse(stored) as Partial<CloudWorkspace>
    if (typeof workspace.gistId !== 'string' || typeof workspace.sqid !== 'string' || typeof workspace.key !== 'string') return null
    return workspaceForGist(workspace.gistId, workspace.key)
  } catch {
    return null
  }
}

function storeWorkspace(workspace: CloudWorkspace): void {
  localStorage.setItem(CLOUD_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace))
}

function highlight(source: string) {
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
  const [source, setSource] = useState<string>(initialSource)
  const [workbook, setWorkbook] = useState<WorkbookEvaluation>({ results: [], total: '0' })
  const [shareState, setShareState] = useState<string>('')
  const [importState, setImportState] = useState<'done' | 'error' | ''>('')
  const [linkedWorkspace] = useState<CloudWorkspace | null>(readWorkspaceFromLocation)
  const [cloudWorkspace, setCloudWorkspace] = useState<CloudWorkspace | null>(() => linkedWorkspace)
  const [isLoadingLinkedWorkspace, setIsLoadingLinkedWorkspace] = useState<boolean>(() => Boolean(linkedWorkspace))
  const [cloudState, setCloudState] = useState<'idle' | 'saving' | 'saved' | 'error'>(() => linkedWorkspace ? 'saving' : 'idle')
  const [canSyncCloud, setCanSyncCloud] = useState(false)
  const [githubName, setGitHubName] = useState<string | null>(null)
  const appShellRef = useRef<HTMLElement | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importTimerRef = useRef<number | undefined>(undefined)
  const overlayRef = useRef<HTMLPreElement | null>(null)
  const resultsRef = useRef<HTMLOutputElement | null>(null)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined

    const updateViewportHeight = () => {
      appShellRef.current?.style.setProperty('--visual-viewport-height', `${Math.round(viewport.height)}px`)
    }

    const refreshViewportHeight = () => {
      updateViewportHeight()
      window.requestAnimationFrame(updateViewportHeight)
      window.setTimeout(updateViewportHeight, 180)
    }

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshViewportHeight()
    }

    refreshViewportHeight()
    viewport.addEventListener('resize', refreshViewportHeight)
    viewport.addEventListener('scroll', refreshViewportHeight)
    window.addEventListener('pageshow', refreshViewportHeight)
    window.addEventListener('orientationchange', refreshViewportHeight)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      viewport.removeEventListener('resize', refreshViewportHeight)
      viewport.removeEventListener('scroll', refreshViewportHeight)
      window.removeEventListener('pageshow', refreshViewportHeight)
      window.removeEventListener('orientationchange', refreshViewportHeight)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => () => window.clearTimeout(importTimerRef.current), [])

  useEffect(() => {
    let cancelled = false

    async function loadGitHubUser(): Promise<void> {
      try {
        const response = await fetch('/.netlify/functions/github-user')
        if (!response.ok) return
        const user = await response.json() as { name?: unknown }
        if (!cancelled && typeof user.name === 'string' && user.name) setGitHubName(user.name)
      } catch {
        // GitHub is optional, so a missing session should remain quiet.
      }
    }

    void loadGitHubUser()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setShareState('')
    if (isLoadingLinkedWorkspace) return
    localStorage.setItem(STORAGE_KEY, source)
    let disposed = false
    evaluateWorkbook(source)
      .then((next) => {
        if (!disposed) setWorkbook(next)
      })
      .catch(() => {})
    return () => { disposed = true }
  }, [source, isLoadingLinkedWorkspace])

  useEffect(() => {
    if (!linkedWorkspace) return undefined
    const workspace = linkedWorkspace
    let cancelled = false

    async function loadLinkedWorkspace(): Promise<void> {
      try {
        const response = await fetch(`/.netlify/functions/github-gists?id=${workspace.gistId}`)
        if (!response.ok) throw new Error('This workspace could not be loaded from GitHub.')
        const gist = await response.json() as { files?: Record<string, { content?: string }> }
        const encrypted = gist.files?.['num-workbook.enc']?.content
        if (!encrypted) throw new Error('This Gist is not a Num workspace.')
        const nextSource = await decryptWorkbook(encrypted, workspace.key)
        if (cancelled) return
        storeWorkspace(workspace)
        setSource(nextSource)
        setCloudState('saved')
      } catch (error) {
        if (!cancelled) {
          setCloudState('error')
          setShareState(error instanceof Error ? error.message : 'Could not load this workspace.')
        }
      } finally {
        if (!cancelled) setIsLoadingLinkedWorkspace(false)
      }
    }

    void loadLinkedWorkspace()
    return () => { cancelled = true }
  }, [linkedWorkspace])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('github') !== 'connected') return
    url.searchParams.delete('github')
    window.history.replaceState(window.history.state, '', url)

    const previousWorkspace = readStoredWorkspace()
    if (previousWorkspace) {
      setCloudWorkspace(previousWorkspace)
      setCanSyncCloud(true)
      window.history.replaceState(window.history.state, '', workspaceUrl(previousWorkspace))
      setCloudState('saved')
      return
    }

    let cancelled = false
    async function createCloudWorkspace(): Promise<void> {
      try {
        setCloudState('saving')
        const draft = createWorkspace()
        const encrypted = await encryptWorkbook(source, draft.key)
        const createResponse = await fetch('/.netlify/functions/github-gists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encrypted, description: 'Num encrypted workspace' }),
        })
        if (!createResponse.ok) throw new Error('GitHub could not create the workspace.')
        const gist = await createResponse.json() as { id?: string }
        if (!gist.id) throw new Error('GitHub did not return a workspace ID.')

        const nextWorkspace = workspaceForGist(gist.id, draft.key)
        const markResponse = await fetch(`/.netlify/functions/github-gists?id=${nextWorkspace.gistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: encrypted, description: `nums/${nextWorkspace.sqid}` }),
        })
        if (!markResponse.ok) throw new Error('GitHub could not finish creating the workspace.')
        if (cancelled) return

        storeWorkspace(nextWorkspace)
        setCloudWorkspace(nextWorkspace)
        setCanSyncCloud(true)
        window.history.replaceState(window.history.state, '', workspaceUrl(nextWorkspace))
        setCloudState('saved')
      } catch (error) {
        if (!cancelled) {
          setCloudState('error')
          setShareState(error instanceof Error ? error.message : 'Could not create the GitHub workspace.')
        }
      }
    }

    void createCloudWorkspace()
    return () => { cancelled = true }
  }, [source])

  useEffect(() => {
    if (!cloudWorkspace || !canSyncCloud || isLoadingLinkedWorkspace) return undefined
    const workspace = cloudWorkspace
    const timeout = window.setTimeout(() => {
      async function saveCloudWorkspace(): Promise<void> {
        try {
          setCloudState('saving')
          const encrypted = await encryptWorkbook(source, workspace.key)
          const response = await fetch(`/.netlify/functions/github-gists?id=${workspace.gistId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: encrypted, description: `nums/${workspace.sqid}` }),
          })
          if (!response.ok) throw new Error('GitHub could not save the workspace.')
          setCloudState('saved')
        } catch (error) {
          setCloudState('error')
          setShareState(error instanceof Error ? error.message : 'Could not save the GitHub workspace.')
        }
      }

      void saveCloudWorkspace()
    }, CLOUD_SYNC_DELAY)
    return () => window.clearTimeout(timeout)
  }, [canSyncCloud, cloudWorkspace, isLoadingLinkedWorkspace, source])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const url = cloudWorkspace ? workspaceUrl(cloudWorkspace) : replaceUrlForSource(source)
        if (cloudWorkspace && url !== window.location.href) {
          window.history.replaceState(window.history.state, '', url)
        }
      } catch {
        // Keep the workbook usable if the browser declines a history update.
      }
    }, URL_SYNC_DELAY)

    return () => window.clearTimeout(timeout)
  }, [cloudWorkspace, source])

  const lines = useMemo<string[]>(() => source.split('\n'), [source])

  function syncEditorScroll(event: UIEvent<HTMLTextAreaElement>): void {
    const { scrollLeft, scrollTop } = event.currentTarget
    if (overlayRef.current) {
      overlayRef.current.scrollTop = scrollTop
      overlayRef.current.scrollLeft = scrollLeft
    }
    if (resultsRef.current) resultsRef.current.scrollTop = scrollTop
  }

  function syncResultsScroll(event: UIEvent<HTMLOutputElement>): void {
    const { scrollTop } = event.currentTarget
    if (editorRef.current) editorRef.current.scrollTop = scrollTop
    if (overlayRef.current) overlayRef.current.scrollTop = scrollTop
  }

  async function copyShareLink(): Promise<void> {
    const url = cloudWorkspace ? workspaceUrl(cloudWorkspace) : replaceUrlForSource(source)
    try {
      await navigator.clipboard.writeText(url)
      setShareState('Link copied')
    } catch {
      window.prompt('Copy this local-only share link:', url)
      setShareState('Share link ready')
    }
  }

  const cloudActivity = cloudState === 'saving'
    ? (isLoadingLinkedWorkspace ? 'Loading…' : 'Saving…')
    : cloudState === 'error'
      ? 'Couldn’t save'
      : ''

  function connectGitHub(): void {
    localStorage.setItem(STORAGE_KEY, source)
    const authorizationUrl = new URL('/.netlify/functions/github-auth-start', window.location.origin)
    authorizationUrl.searchParams.set('returnTo', `${window.location.pathname}${window.location.search}`)
    window.location.assign(authorizationUrl)
  }

  function showImportState(nextState: 'done' | 'error'): void {
    window.clearTimeout(importTimerRef.current)
    setImportState(nextState)
    importTimerRef.current = window.setTimeout(() => setImportState(''), 2200)
  }

  function openImportPicker(): void {
    fileInputRef.current?.click()
  }

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('This workbook is too large to import.')

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
      {(githubName || cloudActivity) && (
        <div className={`account-status${cloudState === 'error' ? ' error' : ''}`} aria-live="polite">
          {githubName && <span className="account-name">Hello {githubName}</span>}
          {cloudActivity && <span className="cloud-activity">{cloudState === 'saving' && <i aria-hidden="true" />}{cloudActivity}</span>}
        </div>
      )}
      <nav className="actions" aria-label="Workbook actions">
        <input className="visually-hidden" ref={fileInputRef} type="file" accept="application/json,.json" onChange={importWorkbook} />
        <button
          className={`button icon import${importState ? ` ${importState}` : ''}`}
          onClick={openImportPicker}
          aria-label={importState === 'error' ? 'Import failed. Try another workbook.' : 'Import workbook'}
          title="Import workbook"
        >{importState === 'done' ? '✓' : importState === 'error' ? '!' : '↑'}</button>
        <button className="button icon" onClick={() => exportWorkbook(source)} aria-label="Download workbook">↓</button>
        <button className="button github" onClick={connectGitHub}>GitHub</button>
        <button className="button share" onClick={copyShareLink}>{shareState === 'Link copied' ? 'Copied' : 'Copy link'}</button>
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
                onScroll={syncEditorScroll}
                spellCheck="false"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
              />
            </div>
          </section>

          <aside className="result-section">
            <output className="results" ref={resultsRef} onScroll={syncResultsScroll} aria-live="polite">
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

createRoot(document.getElementById('root')!).render(<App />)

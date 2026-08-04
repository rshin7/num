import { AuthenticationError, authenticatedSession, clearSessionCookie, errorResponse, githubRequest, sameOrigin } from './_lib/github'
import type { Context } from '@netlify/functions'

const MAX_GIST_CONTENT_BYTES = 900_000
const GIST_FILE_NAME = 'num-workbook.enc'

interface GistWriteRequest {
  content: string
  description?: string
}

export default async function githubGists(request: Request, _context: Context): Promise<Response> {
  if (!sameOrigin(request)) return errorResponse('Cross-origin requests are not allowed.', 403)

  try {
    const { session, refreshedCookie } = await authenticatedSession(request)
    const url = new URL(request.url)
    let response: Response

    switch (request.method) {
      case 'GET': {
        const gistId = requiredGistId(url)
        response = await githubRequest(session, `/gists/${gistId}`)
        break
      }
      case 'POST': {
        const workbook = await readWorkbook(request)
        response = await githubRequest(session, '/gists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gistPayload(workbook, true)),
        })
        break
      }
      case 'PATCH': {
        const gistId = requiredGistId(url)
        const workbook = await readWorkbook(request)
        response = await githubRequest(session, `/gists/${gistId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gistPayload(workbook, false)),
        })
        break
      }
      case 'DELETE': {
        const gistId = requiredGistId(url)
        response = await githubRequest(session, `/gists/${gistId}`, { method: 'DELETE' })
        break
      }
      default:
        return errorResponse('Method not allowed.', 405, { Allow: 'GET, POST, PATCH, DELETE' })
    }

    return githubResponse(response, refreshedCookie)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401, { 'Set-Cookie': clearSessionCookie(request) })
    }
    return errorResponse(error instanceof Error ? error.message : 'GitHub Gist request failed.', 400)
  }
}

function requiredGistId(url: URL): string {
  const gistId = url.searchParams.get('id')
  if (!gistId || !/^[a-f\d]{16,64}$/i.test(gistId)) throw new Error('A valid Gist ID is required.')
  return gistId
}

async function readWorkbook(request: Request): Promise<GistWriteRequest> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('Request body must be an object.')

  const workbook = body as Partial<GistWriteRequest>
  if (typeof workbook.content !== 'string' || Buffer.byteLength(workbook.content, 'utf8') > MAX_GIST_CONTENT_BYTES) {
    throw new Error('Workbook content must be text no larger than 900 KB.')
  }
  if (workbook.description !== undefined && (typeof workbook.description !== 'string' || workbook.description.length > 160)) {
    throw new Error('Description must be text no longer than 160 characters.')
  }
  return { content: workbook.content, description: workbook.description }
}

function gistPayload(workbook: GistWriteRequest, isNew: boolean): Record<string, unknown> {
  return {
    ...(isNew ? { public: false } : {}),
    description: workbook.description || 'Num encrypted workbook',
    files: { [GIST_FILE_NAME]: { content: workbook.content } },
  }
}

async function githubResponse(response: Response, refreshedCookie?: string): Promise<Response> {
  const headers = new Headers({
    'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  if (refreshedCookie) headers.append('Set-Cookie', refreshedCookie)
  return new Response(await response.text(), { status: response.status, headers })
}

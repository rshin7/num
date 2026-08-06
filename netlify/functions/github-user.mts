import { AuthenticationError, authenticatedSession, clearSessionCookie, errorResponse, githubRequest, jsonResponse, sameOrigin, workspaceRecoveryKey } from './_lib/github'
import type { Context } from '@netlify/functions'

interface GitHubUser {
  id?: unknown
  login?: unknown
  name?: unknown
}

export default async function githubUser(request: Request, _context: Context): Promise<Response> {
  if (!sameOrigin(request)) return errorResponse('Cross-origin requests are not allowed.', 403)
  if (request.method !== 'GET') return errorResponse('Method not allowed.', 405, { Allow: 'GET' })

  try {
    const { session, refreshedCookie } = await authenticatedSession(request)
    const response = await githubRequest(session, '/user')
    if (!response.ok) return githubError(response, refreshedCookie)

    const user = await response.json() as GitHubUser
    const id = typeof user.id === 'number' ? user.id : 0
    const login = typeof user.login === 'string' ? user.login.trim() : ''
    const name = typeof user.name === 'string' ? user.name.trim() : ''
    if (!login || !Number.isSafeInteger(id) || id <= 0) return errorResponse('GitHub did not return a valid account.', 502, refreshedCookie ? { 'Set-Cookie': refreshedCookie } : undefined)
    return jsonResponse({ login, name: name || login, recoveryKey: workspaceRecoveryKey(id) }, 200, refreshedCookie ? { 'Set-Cookie': refreshedCookie } : undefined)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return errorResponse(error.message, 401, { 'Set-Cookie': clearSessionCookie(request) })
    }
    return errorResponse(error instanceof Error ? error.message : 'Could not read the GitHub account.', 502)
  }
}

async function githubError(response: Response, refreshedCookie?: string): Promise<Response> {
  const body = await response.text()
  const headers = refreshedCookie ? { 'Set-Cookie': refreshedCookie } : undefined
  return new Response(body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

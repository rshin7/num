import { AuthenticationError, clearOAuthCookie, errorResponse, completeGitHubAuthorization, sessionCookie } from './_lib/github'
import type { Context } from '@netlify/functions'

export default async function githubAuthCallback(request: Request, _context: Context): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('Method not allowed.', 405, { Allow: 'GET' })

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) {
    return errorResponse(url.searchParams.get('error_description') || 'GitHub sign-in was cancelled.', 400, { 'Set-Cookie': clearOAuthCookie(request) })
  }

  try {
    const { session, returnTo } = await completeGitHubAuthorization(request, code, state)
    const headers = new Headers({ Location: returnTo, 'Cache-Control': 'no-store' })
    headers.append('Set-Cookie', sessionCookie(request, session))
    headers.append('Set-Cookie', clearOAuthCookie(request))
    return new Response(null, { status: 302, headers })
  } catch (error) {
    const message = error instanceof AuthenticationError ? error.message : 'Could not complete GitHub sign-in.'
    return errorResponse(message, 401, { 'Set-Cookie': clearOAuthCookie(request) })
  }
}

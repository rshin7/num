import { errorResponse, startGitHubAuthorization } from './_lib/github'
import type { Context } from '@netlify/functions'

export default async function githubAuthStart(request: Request, _context: Context): Promise<Response> {
  if (request.method !== 'GET') return errorResponse('Method not allowed.', 405, { Allow: 'GET' })

  try {
    const { authorizationUrl, cookie } = startGitHubAuthorization(request)
    return new Response(null, { status: 302, headers: { Location: authorizationUrl, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } })
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not start GitHub sign-in.', 500)
  }
}

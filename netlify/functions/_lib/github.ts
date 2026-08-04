import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const OAUTH_COOKIE = 'num_github_oauth'
export const SESSION_COOKIE = 'num_github_session'
const OAUTH_MAX_AGE_SECONDS = 10 * 60
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const REFRESH_EARLY_SECONDS = 60

interface GitHubConfiguration {
  clientId: string
  clientSecret: string
  callbackUrl: string
}

interface OAuthAttempt {
  state: string
  verifier: string
  returnTo: string
  expiresAt: number
}

export interface GitHubSession {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  refreshTokenExpiresAt?: number
}

interface GitHubTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  error?: string
  error_description?: string
}

export class AuthenticationError extends Error {}

export function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Content-Type', 'application/json; charset=utf-8')
  responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export function errorResponse(message: string, status = 400, headers?: HeadersInit): Response {
  return jsonResponse({ error: message }, status, headers)
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  for (const value of cookieHeader.split(';')) {
    const [key, ...parts] = value.trim().split('=')
    if (key === name) return parts.join('=')
  }
  return null
}

export function sessionCookie(request: Request, session: GitHubSession): string {
  const sessionLifetime = session.refreshTokenExpiresAt
    ? Math.max(1, Math.min(SESSION_MAX_AGE_SECONDS, Math.floor((session.refreshTokenExpiresAt - Date.now()) / 1000)))
    : SESSION_MAX_AGE_SECONDS
  return cookie(request, SESSION_COOKIE, seal(session), sessionLifetime)
}

export function clearSessionCookie(request: Request): string {
  return clearCookie(request, SESSION_COOKIE)
}

export function startGitHubAuthorization(request: Request): { authorizationUrl: string, cookie: string } {
  const configuration = githubConfiguration()
  const state = randomToken(32)
  const verifier = randomToken(48)
  const attempt: OAuthAttempt = {
    state,
    verifier,
    returnTo: safeReturnTo(request),
    expiresAt: Date.now() + OAUTH_MAX_AGE_SECONDS * 1000,
  }
  const authorizationUrl = new URL(GITHUB_AUTHORIZE_URL)
  authorizationUrl.searchParams.set('client_id', configuration.clientId)
  authorizationUrl.searchParams.set('redirect_uri', configuration.callbackUrl)
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')
  authorizationUrl.searchParams.set('prompt', 'select_account')

  return {
    authorizationUrl: authorizationUrl.toString(),
    cookie: cookie(request, OAUTH_COOKIE, seal(attempt), OAUTH_MAX_AGE_SECONDS),
  }
}

export async function completeGitHubAuthorization(request: Request, code: string, state: string): Promise<{ session: GitHubSession, returnTo: string }> {
  const attempt = oauthAttempt(request)
  if (!attempt || attempt.expiresAt < Date.now() || !matches(attempt.state, state)) {
    throw new AuthenticationError('The GitHub sign-in request expired or could not be verified.')
  }

  const configuration = githubConfiguration()
  const token = await requestToken({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: configuration.callbackUrl,
  })
  return { session: sessionFromToken(token), returnTo: attempt.returnTo }
}

export function clearOAuthCookie(request: Request): string {
  return clearCookie(request, OAUTH_COOKIE)
}

export async function authenticatedSession(request: Request): Promise<{ session: GitHubSession, refreshedCookie?: string }> {
  const sealedSession = readCookie(request, SESSION_COOKIE)
  const session = sealedSession ? unseal<GitHubSession>(sealedSession) : null
  if (!isSession(session)) throw new AuthenticationError('Connect GitHub before using cloud workbooks.')

  if (!session.expiresAt || session.expiresAt > Date.now() + REFRESH_EARLY_SECONDS * 1000) {
    return { session }
  }
  if (!session.refreshToken || (session.refreshTokenExpiresAt && session.refreshTokenExpiresAt <= Date.now())) {
    throw new AuthenticationError('Your GitHub session expired. Connect GitHub again.')
  }

  const configuration = githubConfiguration()
  const token = await requestToken({
    client_id: configuration.clientId,
    client_secret: configuration.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  })
  const refreshedSession = sessionFromToken(token, session)
  return { session: refreshedSession, refreshedCookie: sessionCookie(request, refreshedSession) }
}

export async function githubRequest(session: GitHubSession, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${session.accessToken}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  headers.set('User-Agent', 'num-workbook')
  return fetch(new URL(path, GITHUB_API_URL), { ...init, headers })
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

export function seal(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

export function unseal<T>(value: string): T | null {
  try {
    const payload = Buffer.from(value, 'base64url')
    if (payload.length < 29) return null
    const iv = payload.subarray(0, 12)
    const tag = payload.subarray(12, 28)
    const ciphertext = payload.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
    return JSON.parse(plaintext) as T
  } catch {
    return null
  }
}

function oauthAttempt(request: Request): OAuthAttempt | null {
  const sealedAttempt = readCookie(request, OAUTH_COOKIE)
  const attempt = sealedAttempt ? unseal<OAuthAttempt>(sealedAttempt) : null
  if (!attempt || typeof attempt.state !== 'string' || typeof attempt.verifier !== 'string' || typeof attempt.returnTo !== 'string' || typeof attempt.expiresAt !== 'number') {
    return null
  }
  return attempt
}

async function requestToken(parameters: Record<string, string>): Promise<GitHubTokenResponse> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
  })
  const token = await response.json() as GitHubTokenResponse
  if (!response.ok || !token.access_token) {
    throw new AuthenticationError(token.error_description || token.error || 'GitHub did not issue an access token.')
  }
  return token
}

function sessionFromToken(token: GitHubTokenResponse, previous?: GitHubSession): GitHubSession {
  if (!token.access_token) throw new AuthenticationError('GitHub did not issue an access token.')
  const now = Date.now()
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? previous?.refreshToken,
    expiresAt: typeof token.expires_in === 'number' ? now + token.expires_in * 1000 : undefined,
    refreshTokenExpiresAt: typeof token.refresh_token_expires_in === 'number'
      ? now + token.refresh_token_expires_in * 1000
      : previous?.refreshTokenExpiresAt,
  }
}

function isSession(value: unknown): value is GitHubSession {
  return Boolean(value) && typeof value === 'object' && typeof (value as GitHubSession).accessToken === 'string'
}

function githubConfiguration(): GitHubConfiguration {
  const clientId = requiredEnvironment('GITHUB_APP_CLIENT_ID')
  const clientSecret = requiredEnvironment('GITHUB_APP_CLIENT_SECRET')
  const callbackUrl = requiredEnvironment('GITHUB_APP_CALLBACK_URL')
  new URL(callbackUrl)
  return { clientId, clientSecret, callbackUrl }
}

function encryptionKey(): Buffer {
  const secret = requiredEnvironment('NUM_SESSION_SECRET')
  if (secret.length < 32) throw new Error('NUM_SESSION_SECRET must be at least 32 characters long.')
  return createHash('sha256').update(secret).digest()
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function cookie(request: Request, name: string, value: string, maxAge: number): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure ? '; Secure' : ''}`
}

function clearCookie(request: Request, name: string): string {
  return `${cookie(request, name, '', 0)}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

function safeReturnTo(request: Request): string {
  const requestUrl = new URL(request.url)
  const candidate = new URL(requestUrl.searchParams.get('returnTo') || '/', requestUrl.origin)
  return candidate.origin === requestUrl.origin ? candidate.toString() : new URL('/', requestUrl.origin).toString()
}

function matches(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(actual)
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

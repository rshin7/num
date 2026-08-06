import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NUM_SESSION_SECRET = 'test-session-secret-that-is-long-enough-to-encrypt-cookie-values'

const { seal, unseal, workspaceRecoveryKey } = await import('../netlify/functions/_lib/github')

test('seals GitHub session data so tokens are not readable in cookies', () => {
  const session = { accessToken: 'ghu_example', refreshToken: 'ghr_example', expiresAt: Date.now() + 60_000 }
  const sealed = seal(session)

  assert.doesNotMatch(sealed, /ghu_example|ghr_example/)
  assert.deepEqual(unseal<typeof session>(sealed), session)
})

test('rejects a modified sealed cookie', () => {
  const sealed = seal({ accessToken: 'ghu_example' })
  const modified = `${sealed[0] === 'a' ? 'b' : 'a'}${sealed.slice(1)}`

  assert.equal(unseal(modified), null)
})

test('derives a stable distinct recovery key for each GitHub user', () => {
  assert.equal(workspaceRecoveryKey(123), workspaceRecoveryKey(123))
  assert.notEqual(workspaceRecoveryKey(123), workspaceRecoveryKey(456))
  assert.equal(Buffer.from(workspaceRecoveryKey(123), 'base64url').length, 32)
})

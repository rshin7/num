import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NUM_SESSION_SECRET = 'test-session-secret-that-is-long-enough-to-encrypt-cookie-values'

const { seal, unseal } = await import('../netlify/functions/_lib/github')

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

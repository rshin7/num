import assert from 'node:assert/strict'
import test from 'node:test'

const { decryptWorkbook, encryptWorkbook, gistIdToSqid, sqidToGistId } = await import('../src/cloud')

test('round-trips GitHub Gist IDs through a Sqid', () => {
  const gistId = '0a17be398d1f2468c0ffee1234567890'
  const sqid = gistIdToSqid(gistId)

  assert.match(sqid, /^[A-Za-z0-9]+$/)
  assert.equal(sqidToGistId(sqid), gistId)
})

test('encrypts a workbook without leaving its source in the Gist payload', async () => {
  const key = 'mDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE'
  const source = 'pay = $3,500\npay - $1,450 # rent'
  const encrypted = await encryptWorkbook(source, key)

  assert.doesNotMatch(encrypted, /pay|rent|3,500/)
  assert.equal(await decryptWorkbook(encrypted, key), source)
})

test('rejects the wrong workspace key', async () => {
  const encrypted = await encryptWorkbook('25 * 4', 'mDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE')

  await assert.rejects(
    decryptWorkbook(encrypted, 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg'),
    /cannot decrypt/,
  )
})

import Sqids from 'sqids'

const GIST_HEX_CHUNK_LENGTH = 12
const WORKSPACE_KEY_BYTES = 32
const ENCRYPTION_VERSION = 1
const sqids = new Sqids({ minLength: 12 })

export interface CloudWorkspace {
  gistId: string
  sqid: string
  key: string
}

interface EncryptedWorkbook {
  version: number
  algorithm: 'AES-GCM'
  iv: string
  ciphertext: string
}

export function createWorkspace(): CloudWorkspace {
  const key = new Uint8Array(WORKSPACE_KEY_BYTES)
  crypto.getRandomValues(key)
  return { gistId: '', sqid: '', key: bytesToBase64Url(key) }
}

export function workspaceForGist(gistId: string, key: string): CloudWorkspace {
  return { gistId, sqid: gistIdToSqid(gistId), key: validatedWorkspaceKey(key) }
}

export function gistIdToSqid(gistId: string): string {
  if (!/^[a-f\d]{16,64}$/i.test(gistId)) throw new Error('GitHub returned an invalid Gist ID.')

  const firstChunkLength = gistId.length % GIST_HEX_CHUNK_LENGTH || GIST_HEX_CHUNK_LENGTH
  const chunks = [gistId.length]
  for (let index = 0; index < gistId.length; index += index === 0 ? firstChunkLength : GIST_HEX_CHUNK_LENGTH) {
    const width = index === 0 ? firstChunkLength : GIST_HEX_CHUNK_LENGTH
    chunks.push(Number.parseInt(gistId.slice(index, index + width), 16))
  }
  return sqids.encode(chunks)
}

export function sqidToGistId(sqid: string): string {
  const chunks = sqids.decode(sqid)
  const [length, ...values] = chunks
  if (!length || length < 16 || length > 64 || !values.length) throw new Error('This is not a valid Num workspace link.')

  const firstChunkLength = length % GIST_HEX_CHUNK_LENGTH || GIST_HEX_CHUNK_LENGTH
  const expectedChunks = 1 + Math.ceil((length - firstChunkLength) / GIST_HEX_CHUNK_LENGTH)
  if (values.length !== expectedChunks) throw new Error('This is not a valid Num workspace link.')

  const gistId = values.map((value, index) => {
    const width = index === 0 ? firstChunkLength : GIST_HEX_CHUNK_LENGTH
    if (!Number.isSafeInteger(value) || value < 0 || value >= 16 ** width) throw new Error('This is not a valid Num workspace link.')
    return value.toString(16).padStart(width, '0')
  }).join('')
  if (gistId.length !== length) throw new Error('This is not a valid Num workspace link.')
  return gistId
}

export function workspaceFromLocation(location: Location = window.location): CloudWorkspace | null {
  const match = location.pathname.match(/^\/gist\/([^/]+)\/?$/)
  if (!match || !location.hash) return null
  return { gistId: sqidToGistId(match[1]), sqid: match[1], key: validatedWorkspaceKey(location.hash.slice(1)) }
}

export function workspaceUrl(workspace: CloudWorkspace): string {
  const url = new URL(window.location.href)
  url.pathname = `/gist/${workspace.sqid}`
  url.search = ''
  url.hash = workspace.key
  return url.toString()
}

export async function encryptWorkbook(source: string, key: string): Promise<string> {
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const plaintext = new TextEncoder().encode(JSON.stringify({ version: 1, source }))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(key, ['encrypt']), plaintext)
  const envelope: EncryptedWorkbook = {
    version: ENCRYPTION_VERSION,
    algorithm: 'AES-GCM',
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(envelope)
}

export async function decryptWorkbook(encrypted: string, key: string): Promise<string> {
  let envelope: unknown
  try {
    envelope = JSON.parse(encrypted)
  } catch {
    throw new Error('This Gist does not contain a valid Num workspace.')
  }
  if (!isEncryptedWorkbook(envelope)) throw new Error('This Gist does not contain a valid Num workspace.')

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: arrayBuffer(base64UrlToBytes(envelope.iv)) },
      await cryptoKey(key, ['decrypt']),
      arrayBuffer(base64UrlToBytes(envelope.ciphertext)),
    )
    const workbook = JSON.parse(new TextDecoder().decode(plaintext)) as { version?: number, source?: unknown }
    if (workbook.version !== 1 || typeof workbook.source !== 'string') throw new Error()
    return workbook.source
  } catch {
    throw new Error('This workspace link cannot decrypt the Gist.')
  }
}

function isEncryptedWorkbook(value: unknown): value is EncryptedWorkbook {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false
  const envelope = value as Partial<EncryptedWorkbook>
  return envelope.version === ENCRYPTION_VERSION && envelope.algorithm === 'AES-GCM' && typeof envelope.iv === 'string' && typeof envelope.ciphertext === 'string'
}

async function cryptoKey(key: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', arrayBuffer(base64UrlToBytes(validatedWorkspaceKey(key))), 'AES-GCM', false, usages)
}

function validatedWorkspaceKey(key: string): string {
  if (base64UrlToBytes(key).length !== WORKSPACE_KEY_BYTES) throw new Error('This workspace link has an invalid encryption key.')
  return key
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('Invalid base64url data.')
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

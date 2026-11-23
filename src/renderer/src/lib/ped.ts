import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import type { PedPayload } from './types'
import { bytesToDataUrl, dataUrlToBytes } from './images'
import { defaultMeta, defaultPage, defaultStyles } from './defaults'

export const PED_FORMAT_VERSION = 1

interface Manifest {
  format: 'ped'
  version: number
  docId: string
  app: string
  created: number
  modified: number
  encrypted: boolean
  salt?: string
  iv?: string
  iterations?: number
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp'
}
const MIME: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]))

function walk(node: JSONContent, fn: (n: JSONContent) => void): void {
  fn(node)
  node.content?.forEach((c) => walk(c, fn))
}

const b64 = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function buildInnerZip(p: PedPayload): Promise<Uint8Array> {
  const zip = new JSZip()
  const content = structuredClone(p.content)
  let n = 0
  const media = zip.folder('media')!
  walk(content, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.startsWith('data:')) {
      const { bytes, mime } = dataUrlToBytes(node.attrs.src)
      const name = `image${++n}.${EXT[mime] ?? 'bin'}`
      media.file(name, bytes)
      node.attrs.src = `ped-media:${name}`
    }
  })
  zip.file('content.json', JSON.stringify(content))
  zip.file('page.json', JSON.stringify(p.page, null, 1))
  zip.file('styles.json', JSON.stringify(p.styles, null, 1))
  zip.file('meta.json', JSON.stringify(p.meta, null, 1))
  zip.file('comments.json', JSON.stringify(p.comments))
  zip.file('sources.json', JSON.stringify(p.sources))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

async function readInnerZip(zip: JSZip, docId: string): Promise<PedPayload> {
  const read = async <T>(name: string, fallback: T): Promise<T> => {
    const f = zip.file(name)
    if (!f) return fallback
    try {
      return JSON.parse(await f.async('string')) as T
    } catch {
      return fallback
    }
  }
  const content = await read<JSONContent>('content.json', { type: 'doc', content: [{ type: 'paragraph' }] })
  const pending: Promise<void>[] = []
  walk(content, (node) => {
    if (node.type === 'image' && typeof node.attrs?.src === 'string' && node.attrs.src.startsWith('ped-media:')) {
      const name = node.attrs.src.slice('ped-media:'.length)
      const f = zip.file(`media/${name}`)
      if (f) {
        const attrs = node.attrs
        pending.push(
          f.async('uint8array').then((bytes) => {
            attrs.src = bytesToDataUrl(bytes, MIME[name.split('.').pop() || ''] ?? 'application/octet-stream')
          })
        )
      }
    }
  })
  await Promise.all(pending)
  return {
    docId,
    content,
    page: { ...defaultPage(), ...(await read('page.json', {})) },
    styles: { ...defaultStyles(), ...(await read('styles.json', {})) },
    meta: { ...defaultMeta(), ...(await read('meta.json', {})) },
    comments: await read('comments.json', []),
    sources: await read('sources.json', [])
  }
}

export async function serializePed(p: PedPayload, password?: string | null): Promise<Uint8Array> {
  const inner = await buildInnerZip(p)
  const manifest: Manifest = {
    format: 'ped',
    version: PED_FORMAT_VERSION,
    docId: p.docId,
    app: 'Personal Editor',
    created: p.meta.created,
    modified: Date.now(),
    encrypted: !!password
  }
  const outer = new JSZip()
  if (password) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const iterations = 250_000
    const key = await deriveKey(password, salt, iterations)
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, inner as BufferSource))
    manifest.salt = b64(salt)
    manifest.iv = b64(iv)
    manifest.iterations = iterations
    outer.file('manifest.json', JSON.stringify(manifest, null, 1))
    outer.file('payload.bin', cipher)
    return outer.generateAsync({ type: 'uint8array', compression: 'STORE' })
  }
  outer.file('manifest.json', JSON.stringify(manifest, null, 1))
  const innerZip = await JSZip.loadAsync(inner)
  for (const [name, file] of Object.entries(innerZip.files)) {
    if (file.dir) continue
    outer.file(name, await file.async('uint8array'))
  }
  return outer.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export class PasswordRequiredError extends Error {
  constructor(public wrong = false) {
    super(wrong ? 'The password is incorrect.' : 'This document is protected with a password.')
  }
}

export async function parsePed(bytes: Uint8Array, password?: string | null): Promise<PedPayload> {
  const zip = await JSZip.loadAsync(bytes)
  const mf = zip.file('manifest.json')
  if (!mf) throw new Error('This file is not a Personal Editor document.')
  const manifest = JSON.parse(await mf.async('string')) as Manifest
  if (manifest.format !== 'ped') throw new Error('This file is not a Personal Editor document.')
  if (manifest.version > PED_FORMAT_VERSION) {
    console.warn('Document was saved by a newer version of Personal Editor')
  }
  if (manifest.encrypted) {
    if (!password) throw new PasswordRequiredError(false)
    const key = await deriveKey(password, unb64(manifest.salt!), manifest.iterations ?? 250_000)
    const cipher = await zip.file('payload.bin')!.async('uint8array')
    let plain: ArrayBuffer
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(manifest.iv!) as BufferSource }, key, cipher as BufferSource)
    } catch {
      throw new PasswordRequiredError(true)
    }
    return readInnerZip(await JSZip.loadAsync(plain), manifest.docId)
  }
  return readInnerZip(zip, manifest.docId)
}

import { app } from 'electron'
import { promises as fs, existsSync, mkdirSync, readFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { gzipSync, gunzipSync } from 'zlib'
import { randomUUID } from 'crypto'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type LibraryEntry,
  type LibraryHit,
  type RecentFile,
  type RecoveryEntry,
  type VersionEntry
} from '@shared/types'

const dataDir = (): string => app.getPath('userData')
const p = (...parts: string[]): string => join(dataDir(), ...parts)

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Write a file atomically: write to a temp file first, then rename over the target. */
export async function atomicWrite(target: string, data: Uint8Array | string): Promise<void> {
  ensureDir(dirname(target))
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  const handle = await fs.open(tmp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(tmp, target)
  } catch (err) {
    // On Windows rename can fail if the target is briefly locked (antivirus, indexer). Retry, then copy.
    await new Promise((r) => setTimeout(r, 120))
    try {
      await fs.rename(tmp, target)
    } catch {
      await fs.copyFile(tmp, target)
      await fs.unlink(tmp).catch(() => undefined)
    }
  }
}

function readJsonSync<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- settings

let settingsCache: AppSettings | null = null

export function getSettings(): AppSettings {
  if (!settingsCache) {
    settingsCache = { ...DEFAULT_SETTINGS, ...readJsonSync<Partial<AppSettings>>(p('settings.json'), {}) }
  }
  return settingsCache
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  settingsCache = { ...getSettings(), ...patch }
  await atomicWrite(p('settings.json'), JSON.stringify(settingsCache, null, 2))
  return settingsCache
}

// ---------------------------------------------------------------- window state

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized: boolean
}

export function getWindowState(): WindowState {
  return readJsonSync<WindowState>(p('window-state.json'), { width: 1400, height: 900, maximized: false })
}

export async function saveWindowState(state: WindowState): Promise<void> {
  await atomicWrite(p('window-state.json'), JSON.stringify(state))
}

// ---------------------------------------------------------------- recents

export async function listRecents(): Promise<RecentFile[]> {
  const list = await readJson<RecentFile[]>(p('recents.json'), [])
  return list.filter((r) => existsSync(r.path))
}

export async function touchRecent(entry: Omit<RecentFile, 'openedAt'> & { openedAt?: number }): Promise<RecentFile[]> {
  const list = await readJson<RecentFile[]>(p('recents.json'), [])
  const existing = list.find((r) => r.path === entry.path)
  const next: RecentFile = {
    ...existing,
    ...entry,
    pinned: entry.pinned ?? existing?.pinned ?? false,
    openedAt: entry.openedAt ?? Date.now()
  }
  const rest = list.filter((r) => r.path !== entry.path)
  const out = [next, ...rest].slice(0, 60)
  await atomicWrite(p('recents.json'), JSON.stringify(out, null, 1))
  return out
}

export async function updateRecent(path: string, patch: Partial<RecentFile>): Promise<RecentFile[]> {
  const list = await readJson<RecentFile[]>(p('recents.json'), [])
  const out = list.map((r) => (r.path === path ? { ...r, ...patch } : r))
  await atomicWrite(p('recents.json'), JSON.stringify(out, null, 1))
  return out
}

export async function removeRecent(path: string): Promise<RecentFile[]> {
  const list = await readJson<RecentFile[]>(p('recents.json'), [])
  const out = list.filter((r) => r.path !== path)
  await atomicWrite(p('recents.json'), JSON.stringify(out, null, 1))
  return out
}

// ---------------------------------------------------------------- versions

const versionsDir = (docId: string): string => p('versions', docId.replace(/[^a-zA-Z0-9-]/g, ''))

export async function listVersions(docId: string): Promise<VersionEntry[]> {
  const list = await readJson<VersionEntry[]>(join(versionsDir(docId), 'index.json'), [])
  return list.sort((a, b) => b.createdAt - a.createdAt)
}

export async function addVersion(
  docId: string,
  data: string,
  meta: { reason: VersionEntry['reason']; label?: string; title: string; words: number }
): Promise<VersionEntry> {
  const dir = versionsDir(docId)
  ensureDir(dir)
  const id = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const gz = gzipSync(Buffer.from(data, 'utf8'))
  await atomicWrite(join(dir, `${id}.json.gz`), gz)
  const entry: VersionEntry = {
    id,
    docId,
    createdAt: Date.now(),
    reason: meta.reason,
    label: meta.label,
    title: meta.title,
    words: meta.words,
    size: gz.length
  }
  const list = await listVersions(docId)
  const pruned = prune([entry, ...list])
  const keep = new Set(pruned.map((v) => v.id))
  for (const v of list) {
    if (!keep.has(v.id)) await fs.unlink(join(dir, `${v.id}.json.gz`)).catch(() => undefined)
  }
  await atomicWrite(join(dir, 'index.json'), JSON.stringify(pruned))
  return entry
}

/** Keep everything for 24h, then one per hour for a week, then one per day. Named versions are kept forever. */
function prune(list: VersionEntry[]): VersionEntry[] {
  const now = Date.now()
  const H = 3600_000
  const D = 24 * H
  const seen = new Set<string>()
  const out: VersionEntry[] = []
  for (const v of list.sort((a, b) => b.createdAt - a.createdAt)) {
    const age = now - v.createdAt
    if (v.label || v.reason === 'manual' || age < D) {
      out.push(v)
      continue
    }
    const bucket = age < 7 * D ? `h${Math.floor(v.createdAt / H)}` : `d${Math.floor(v.createdAt / D)}`
    if (seen.has(bucket)) continue
    seen.add(bucket)
    out.push(v)
  }
  return out.slice(0, 400)
}

export async function getVersion(docId: string, id: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(join(versionsDir(docId), `${basename(id)}.json.gz`))
    return gunzipSync(buf).toString('utf8')
  } catch {
    return null
  }
}

export async function deleteVersion(docId: string, id: string): Promise<void> {
  const list = await listVersions(docId)
  await fs.unlink(join(versionsDir(docId), `${basename(id)}.json.gz`)).catch(() => undefined)
  await atomicWrite(join(versionsDir(docId), 'index.json'), JSON.stringify(list.filter((v) => v.id !== id)))
}

export async function renameVersion(docId: string, id: string, label: string): Promise<void> {
  const list = await listVersions(docId)
  await atomicWrite(
    join(versionsDir(docId), 'index.json'),
    JSON.stringify(list.map((v) => (v.id === id ? { ...v, label } : v)))
  )
}

// ---------------------------------------------------------------- recovery

const recoveryFile = (docId: string): string => p('recovery', `${docId.replace(/[^a-zA-Z0-9-]/g, '')}.json`)

export async function writeRecovery(entry: RecoveryEntry): Promise<void> {
  await atomicWrite(recoveryFile(entry.docId), JSON.stringify(entry))
}

export async function removeRecovery(docId: string): Promise<void> {
  await fs.unlink(recoveryFile(docId)).catch(() => undefined)
}

export async function listRecovery(): Promise<RecoveryEntry[]> {
  const dir = p('recovery')
  if (!existsSync(dir)) return []
  const files = await fs.readdir(dir)
  const out: RecoveryEntry[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const e = await readJson<RecoveryEntry | null>(join(dir, f), null)
    if (e) out.push(e)
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

// ---------------------------------------------------------------- library search

let libraryCache: LibraryEntry[] | null = null

async function loadLibrary(): Promise<LibraryEntry[]> {
  if (!libraryCache) libraryCache = await readJson<LibraryEntry[]>(p('library.json'), [])
  return libraryCache
}

let libraryWriteTimer: NodeJS.Timeout | null = null
function scheduleLibraryWrite(): void {
  if (libraryWriteTimer) clearTimeout(libraryWriteTimer)
  libraryWriteTimer = setTimeout(() => {
    if (libraryCache) void atomicWrite(p('library.json'), JSON.stringify(libraryCache))
  }, 800)
}

export async function indexLibrary(entry: LibraryEntry): Promise<void> {
  const lib = await loadLibrary()
  const text = entry.text.slice(0, 200_000)
  const rest = lib.filter((e) => e.path !== entry.path && e.docId !== entry.docId)
  libraryCache = [{ ...entry, text }, ...rest].slice(0, 2000)
  scheduleLibraryWrite()
}

export async function searchLibrary(query: string): Promise<LibraryHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/).filter(Boolean)
  const lib = await loadLibrary()
  const hits: LibraryHit[] = []
  for (const e of lib) {
    if (!existsSync(e.path)) continue
    const title = e.title.toLowerCase()
    const text = e.text.toLowerCase()
    let score = 0
    let first = -1
    let all = true
    for (const t of terms) {
      const inTitle = title.includes(t)
      const idx = text.indexOf(t)
      if (!inTitle && idx < 0) {
        all = false
        break
      }
      if (inTitle) score += 10
      if (idx >= 0) {
        score += 2
        if (first < 0 || idx < first) first = idx
        let count = 0
        let from = idx
        while (from >= 0 && count < 20) {
          count++
          from = text.indexOf(t, from + t.length)
        }
        score += Math.min(count, 20) * 0.5
      }
    }
    if (!all) continue
    const start = Math.max(0, first - 60)
    const snippet = first >= 0 ? (start > 0 ? '…' : '') + e.text.slice(start, start + 180).replace(/\s+/g, ' ') + '…' : e.text.slice(0, 160)
    hits.push({ docId: e.docId, path: e.path, title: e.title, snippet, score, modified: e.modified })
  }
  return hits.sort((a, b) => b.score - a.score || b.modified - a.modified).slice(0, 50)
}

// ---------------------------------------------------------------- user templates

export interface UserTemplate {
  id: string
  name: string
  createdAt: number
}

export async function listTemplates(): Promise<UserTemplate[]> {
  return readJson<UserTemplate[]>(p('templates', 'index.json'), [])
}

export async function saveTemplate(name: string, data: Uint8Array): Promise<UserTemplate> {
  const id = randomUUID()
  await atomicWrite(p('templates', `${id}.ped`), data)
  const list = await listTemplates()
  const t = { id, name, createdAt: Date.now() }
  await atomicWrite(p('templates', 'index.json'), JSON.stringify([t, ...list]))
  return t
}

export async function readTemplate(id: string): Promise<Uint8Array | null> {
  try {
    return await fs.readFile(p('templates', `${basename(id)}.ped`))
  } catch {
    return null
  }
}

export async function deleteTemplate(id: string): Promise<void> {
  const list = await listTemplates()
  await fs.unlink(p('templates', `${basename(id)}.ped`)).catch(() => undefined)
  await atomicWrite(p('templates', 'index.json'), JSON.stringify(list.filter((t) => t.id !== id)))
}

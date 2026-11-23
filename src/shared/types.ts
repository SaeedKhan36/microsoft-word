// Types shared by the main process, preload bridge and renderer.

export type FileKind = 'ped' | 'docx' | 'html' | 'md' | 'txt' | 'pdf' | 'unknown'

export interface RecentFile {
  path: string
  title: string
  docId?: string
  excerpt?: string
  words?: number
  openedAt: number
  pinned?: boolean
}

export interface VersionEntry {
  id: string
  docId: string
  createdAt: number
  reason: 'auto' | 'save' | 'manual' | 'restore'
  label?: string
  title: string
  words: number
  size: number
}

export interface RecoveryEntry {
  docId: string
  title: string
  path?: string | null
  updatedAt: number
  data: string // serialized JSON payload
}

export interface LibraryEntry {
  docId: string
  path: string
  title: string
  text: string
  words: number
  modified: number
}

export interface LibraryHit {
  docId: string
  path: string
  title: string
  snippet: string
  score: number
  modified: number
}

export interface PrinterInfo {
  name: string
  displayName: string
  description?: string
  isDefault: boolean
}

export interface PrintJob {
  html: string
  pageWidthMm: number
  pageHeightMm: number
  docTitle: string
  baseFontVars?: string
}

export interface PrintOptions {
  deviceName?: string
  copies?: number
  pageRanges?: string // e.g. "1-3,5"
  color?: boolean
  duplex?: 'simplex' | 'shortEdge' | 'longEdge'
  silent?: boolean
  collate?: boolean
}

export interface ContextMenuParams {
  x: number
  y: number
  misspelledWord: string
  dictionarySuggestions: string[]
  isEditable: boolean
  selectionText: string
  linkURL: string
}

export interface AppSettings {
  theme: 'system' | 'light' | 'dark'
  userName: string
  userInitials: string
  autoSave: boolean
  recoveryIntervalSec: number
  versionIntervalMin: number
  defaultFont: string
  defaultFontSize: number
  spellcheck: boolean
  spellLanguages: string[]
  showRuler: boolean
  units: 'cm' | 'in'
  ribbonMode: 'full' | 'simplified' | 'hidden'
  darkPages: boolean
  startup: 'start' | 'blank'
  showFormattingMarks: boolean
  typewriterScrolling: boolean
  aiApiKey?: string
  wordGoal?: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  userName: 'Me',
  userInitials: 'ME',
  autoSave: true,
  recoveryIntervalSec: 2,
  versionIntervalMin: 5,
  defaultFont: 'Calibri',
  defaultFontSize: 11,
  spellcheck: true,
  spellLanguages: ['en-US'],
  showRuler: true,
  units: 'cm',
  ribbonMode: 'full',
  darkPages: false,
  startup: 'start',
  showFormattingMarks: false,
  typewriterScrolling: false,
  wordGoal: 0
}

import type { JSONContent } from '@tiptap/core'

export interface HeaderFooterContent {
  left: string
  center: string
  right: string
}

export interface Watermark {
  text: string
  color: string
  opacity: number
  diagonal: boolean
  fontSize: number
}

export interface PageBorder {
  style: 'none' | 'single' | 'double' | 'thick' | 'dashed' | 'dotted'
  color: string
  offsetMm: number
}

export interface PageSettings {
  sizeName: string
  widthMm: number // portrait width
  heightMm: number // portrait height
  orientation: 'portrait' | 'landscape'
  margins: { top: number; bottom: number; left: number; right: number } // mm
  header: HeaderFooterContent
  footer: HeaderFooterContent
  firstHeader: HeaderFooterContent
  firstFooter: HeaderFooterContent
  differentFirstPage: boolean
  headerDistanceMm: number
  footerDistanceMm: number
  pageColor: string | null
  watermark: Watermark | null
  border: PageBorder
  lineNumbers: 'none' | 'continuous' | 'page'
  hyphenation: boolean
  pageNumberStart: number
}

export interface DocStyles {
  theme: string
  bodyFont: string
  headingFont: string
  fontSize: number // pt
  lineHeight: number
  spaceAfter: number // pt
  headingColor: string
  accent: string
  textColor: string
  citationStyle: 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee'
}

export interface DocMeta {
  title: string
  author: string
  subject: string
  keywords: string
  description: string
  created: number
  modified: number
}

export interface CommentReply {
  id: string
  author: string
  initials: string
  date: number
  text: string
}

export interface CommentThread {
  id: string
  author: string
  initials: string
  date: number
  text: string
  resolved: boolean
  replies: CommentReply[]
  quote: string
}

export interface Source {
  id: string
  type: 'book' | 'article' | 'website' | 'report' | 'other'
  authors: string // "Last, First; Last, First"
  title: string
  year: string
  publisher: string
  city: string
  journal: string
  volume: string
  pages: string
  url: string
  accessed: string
}

export interface PedPayload {
  docId: string
  content: JSONContent
  page: PageSettings
  styles: DocStyles
  meta: DocMeta
  comments: CommentThread[]
  sources: Source[]
}

export interface DocStats {
  words: number
  chars: number
  charsNoSpaces: number
  paragraphs: number
  pages: number
  currentPage: number
  selectionWords: number
}

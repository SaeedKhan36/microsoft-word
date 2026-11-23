import type { Node as PMNode } from '@tiptap/pm/model'

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu

export function countWords(text: string): number {
  return (text.match(WORD) || []).length
}

export function docText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, '\n', ' ')
}

export function basicStats(doc: PMNode): { words: number; chars: number; charsNoSpaces: number; paragraphs: number } {
  let paragraphs = 0
  doc.descendants((n) => {
    if (n.isTextblock && n.textContent.trim()) paragraphs++
    return true
  })
  const text = docText(doc)
  return {
    words: countWords(text),
    chars: text.replace(/\n/g, '').length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    paragraphs
  }
}

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, m ? m.length : 1)
}

export interface Readability {
  sentences: number
  words: number
  avgSentence: number
  avgWordLength: number
  fleschEase: number
  grade: number
  readingMinutes: number
  speakingMinutes: number
  label: string
}

export function readability(text: string): Readability {
  const words = text.match(WORD) || []
  const sentences = Math.max(1, (text.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/gm) || []).filter((s) => s.trim().length > 1).length)
  const syl = words.reduce((s, w) => s + syllables(w), 0)
  const wc = Math.max(1, words.length)
  const ease = 206.835 - 1.015 * (wc / sentences) - 84.6 * (syl / wc)
  const grade = 0.39 * (wc / sentences) + 11.8 * (syl / wc) - 15.59
  const clamp = Math.max(0, Math.min(100, ease))
  const label =
    clamp >= 90 ? 'Very easy' : clamp >= 70 ? 'Easy' : clamp >= 60 ? 'Plain English' : clamp >= 50 ? 'Fairly difficult' : clamp >= 30 ? 'Difficult' : 'Very difficult'
  return {
    sentences,
    words: words.length,
    avgSentence: wc / sentences,
    avgWordLength: words.reduce((s, w) => s + w.length, 0) / wc,
    fleschEase: clamp,
    grade: Math.max(0, grade),
    readingMinutes: words.length / 238,
    speakingMinutes: words.length / 150,
    label
  }
}

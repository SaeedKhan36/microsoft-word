import type { PrintJob } from '@shared/types'
import { pageSizePx } from './units'
import type { DocTab } from '@/state/store'

export const PAGE_GAP = 28

/**
 * Build a print job from the live, paginated page stack: the sheets and the editor
 * content are cloned, page gaps are removed, and interactive chrome is stripped so
 * the printout matches what's on screen.
 */
export function buildPrintJob(doc: DocTab): PrintJob {
  const stack = document.querySelector<HTMLElement>(`[data-page-stack="${doc.id}"]`)
  if (!stack) throw new Error('Switch to Print Layout to print this document.')
  const { h, wMm, hMm } = pageSizePx(doc.page)
  const clone = stack.cloneNode(true) as HTMLElement
  clone.classList.add('pe-printing')
  clone.classList.remove('pe-dark-pages')
  clone.style.transform = ''
  clone.removeAttribute('data-page-stack')

  // Sheets: stack them without gaps.
  clone.querySelectorAll<HTMLElement>('.pe-sheet').forEach((sheet, i) => {
    sheet.style.top = `${i * h}px`
  })
  // Spacers: each spacer moves content down exactly one page, so remove one gap from each.
  clone.querySelectorAll<HTMLElement>('[data-pe-spacer]').forEach((sp) => {
    const height = parseFloat(sp.dataset.h || '0') - PAGE_GAP
    if (sp.tagName === 'TR') {
      const td = sp.firstElementChild as HTMLElement | null
      if (td) td.style.height = `${Math.max(0, height)}px`
    } else sp.style.height = `${Math.max(0, height)}px`
  })
  // Remove editing-only UI.
  clone
    .querySelectorAll(
      '.pe-img-handle, .pe-ink-resize, .pe-ink-hint, .pe-ink-live, .pe-hf-editor, .column-resize-handle, .ProseMirror-gapcursor, .pe-sheet-label, .pe-page-break span'
    )
    .forEach((el) => el.remove())
  clone.querySelectorAll('.ProseMirror-selectednode').forEach((el) => el.classList.remove('ProseMirror-selectednode'))
  clone.querySelectorAll('.pe-find').forEach((el) => el.classList.remove('pe-find', 'pe-find-current'))
  clone.querySelectorAll('.is-empty, .is-editor-empty').forEach((el) => el.removeAttribute('data-placeholder'))
  clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'))
  clone.querySelectorAll('.pe-comment').forEach((el) => el.classList.add('pe-comment-print'))
  const pages = clone.querySelectorAll('.pe-sheet').length || 1
  clone.style.height = `${pages * h}px`
  clone.style.overflow = 'hidden'
  // The on-screen minimum height includes the gaps between pages; drop them so no blank page is added.
  clone.querySelector<HTMLElement>('.pe-editor-host')?.style.setProperty('--min-h', `${pages * h}px`)

  return {
    html: clone.outerHTML,
    pageWidthMm: wMm,
    pageHeightMm: hMm,
    docTitle: doc.meta.title || doc.title
  }
}

import type { DocMeta, DocStyles, PageSettings } from './types'

export const PAPER_SIZES: { name: string; label: string; w: number; h: number }[] = [
  { name: 'A4', label: 'A4', w: 210, h: 297 },
  { name: 'A3', label: 'A3', w: 297, h: 420 },
  { name: 'A5', label: 'A5', w: 148, h: 210 },
  { name: 'B5', label: 'B5 (JIS)', w: 182, h: 257 },
  { name: 'Letter', label: 'Letter', w: 215.9, h: 279.4 },
  { name: 'Legal', label: 'Legal', w: 215.9, h: 355.6 },
  { name: 'Executive', label: 'Executive', w: 184.15, h: 266.7 },
  { name: 'Tabloid', label: 'Tabloid', w: 279.4, h: 431.8 }
]

export const MARGIN_PRESETS: { name: string; m: PageSettings['margins'] }[] = [
  { name: 'Normal', m: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 } },
  { name: 'Narrow', m: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7 } },
  { name: 'Moderate', m: { top: 25.4, bottom: 25.4, left: 19.05, right: 19.05 } },
  { name: 'Wide', m: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8 } },
  { name: 'Office 2003 Default', m: { top: 25.4, bottom: 25.4, left: 31.75, right: 31.75 } }
]

const emptyHF = { left: '', center: '', right: '' }

export function defaultPage(): PageSettings {
  return {
    sizeName: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
    header: { ...emptyHF },
    footer: { ...emptyHF },
    firstHeader: { ...emptyHF },
    firstFooter: { ...emptyHF },
    differentFirstPage: false,
    headerDistanceMm: 12.7,
    footerDistanceMm: 12.7,
    pageColor: null,
    watermark: null,
    border: { style: 'none', color: '#1f3b73', offsetMm: 8 },
    lineNumbers: 'none',
    hyphenation: false,
    pageNumberStart: 1
  }
}

export interface DocTheme {
  id: string
  name: string
  bodyFont: string
  headingFont: string
  headingColor: string
  accent: string
  textColor: string
}

export const DOC_THEMES: DocTheme[] = [
  { id: 'personal', name: 'Personal', bodyFont: 'Calibri', headingFont: 'Calibri', headingColor: '#1f3b73', accent: '#2f5bea', textColor: '#1b1b1b' },
  { id: 'classic', name: 'Classic', bodyFont: 'Times New Roman', headingFont: 'Times New Roman', headingColor: '#1b1b1b', accent: '#8a1c1c', textColor: '#111111' },
  { id: 'modern', name: 'Modern', bodyFont: 'Inter', headingFont: 'Inter', headingColor: '#111827', accent: '#4f46e5', textColor: '#1f2937' },
  { id: 'elegant', name: 'Elegant', bodyFont: 'Source Serif 4', headingFont: 'Lora', headingColor: '#5b2a86', accent: '#a0527d', textColor: '#222222' },
  { id: 'editorial', name: 'Editorial', bodyFont: 'Merriweather', headingFont: 'Inter', headingColor: '#0f5257', accent: '#d1495b', textColor: '#1d1d1d' },
  { id: 'clean', name: 'Clean', bodyFont: 'Arial', headingFont: 'Arial', headingColor: '#0a7c86', accent: '#0a7c86', textColor: '#202124' },
  { id: 'notebook', name: 'Notebook', bodyFont: 'Caveat', headingFont: 'Caveat', headingColor: '#1d4ed8', accent: '#1d4ed8', textColor: '#1e293b' },
  { id: 'technical', name: 'Technical', bodyFont: 'Inter', headingFont: 'JetBrains Mono', headingColor: '#0b6e4f', accent: '#0b6e4f', textColor: '#1f2328' }
]

export function defaultStyles(font = 'Calibri', size = 11): DocStyles {
  const t = DOC_THEMES[0]
  return {
    theme: t.id,
    bodyFont: font,
    headingFont: font === 'Calibri' ? t.headingFont : font,
    fontSize: size,
    lineHeight: 1.15,
    spaceAfter: 8,
    headingColor: t.headingColor,
    accent: t.accent,
    textColor: t.textColor,
    citationStyle: 'apa'
  }
}

export function defaultMeta(title = 'Document'): DocMeta {
  const now = Date.now()
  return { title, author: '', subject: '', keywords: '', description: '', created: now, modified: now }
}

/** Fonts bundled with the app so documents look right on every PC. */
export const BUNDLED_FONTS = ['Carlito', 'Inter', 'Lora', 'Merriweather', 'Source Serif 4', 'JetBrains Mono', 'Caveat']

/** Common Windows fonts shown first in the font picker when installed. */
export const COMMON_FONTS = [
  'Calibri',
  'Aptos',
  'Arial',
  'Times New Roman',
  'Cambria',
  'Georgia',
  'Segoe UI',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Garamond',
  'Book Antiqua',
  'Century Gothic',
  'Consolas',
  'Courier New',
  'Comic Sans MS',
  'Palatino Linotype',
  'Candara',
  'Constantia',
  'Corbel',
  'Franklin Gothic Medium',
  'Lucida Sans Unicode',
  'Impact'
]

export const FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

export const THEME_COLORS: string[][] = [
  ['#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000', '#5b9bd5', '#70ad47'],
  ['#f2f2f2', '#7f7f7f', '#d0cece', '#d6dce4', '#d9e2f3', '#fbe5d5', '#ededed', '#fff2cc', '#deebf6', '#e2efd9'],
  ['#d8d8d8', '#595959', '#aeabab', '#adb9ca', '#b4c6e7', '#f7cbac', '#dbdbdb', '#fee599', '#bdd7ee', '#c5e0b3'],
  ['#bfbfbf', '#3f3f3f', '#757070', '#8496b0', '#8eaadb', '#f4b183', '#c9c9c9', '#ffd965', '#9cc3e5', '#a8d08d'],
  ['#a5a5a5', '#262626', '#3a3838', '#323f4f', '#2f5496', '#c55a11', '#7b7b7b', '#bf9000', '#2e75b5', '#538135'],
  ['#7f7f7f', '#0c0c0c', '#171616', '#222a35', '#1f3864', '#833c0b', '#525252', '#7f6000', '#1e4e79', '#375623']
]

export const STANDARD_COLORS = ['#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060', '#7030a0']

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', c: '#fff176' },
  { name: 'Bright green', c: '#b9f6ca' },
  { name: 'Turquoise', c: '#84ffff' },
  { name: 'Pink', c: '#ff9ecf' },
  { name: 'Blue', c: '#90caf9' },
  { name: 'Red', c: '#ff8a80' },
  { name: 'Dark blue', c: '#5c6bc0' },
  { name: 'Teal', c: '#4db6ac' },
  { name: 'Green', c: '#81c784' },
  { name: 'Violet', c: '#ce93d8' },
  { name: 'Dark red', c: '#e57373' },
  { name: 'Dark yellow', c: '#ffd54f' },
  { name: 'Gray 50%', c: '#bdbdbd' },
  { name: 'Gray 25%', c: '#e0e0e0' },
  { name: 'Black', c: '#424242' }
]

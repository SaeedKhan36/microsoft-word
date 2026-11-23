import type { Source } from './types'

interface Name {
  last: string
  first: string
}

function names(s: Source): Name[] {
  return s.authors
    .split(/;|\band\b/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      if (a.includes(',')) {
        const [last, first] = a.split(',').map((x) => x.trim())
        return { last, first: first || '' }
      }
      const parts = a.split(/\s+/)
      return { last: parts.pop() || a, first: parts.join(' ') }
    })
}

const initials = (first: string): string =>
  first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ')

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function formatCitation(s: Source, style: string, page = ''): string {
  const ns = names(s)
  const year = s.year || 'n.d.'
  const lead =
    ns.length === 0
      ? s.title
      : ns.length === 1
        ? ns[0].last
        : ns.length === 2
          ? `${ns[0].last} ${style === 'mla' ? 'and' : '&'} ${ns[1].last}`
          : `${ns[0].last} et al.`
  switch (style) {
    case 'mla':
      return `(${lead}${page ? ` ${page}` : ''})`
    case 'chicago':
      return `(${lead} ${year}${page ? `, ${page}` : ''})`
    case 'ieee':
      return `[${s.id.slice(-3)}]`
    case 'harvard':
      return `(${lead} ${year}${page ? `, p. ${page}` : ''})`
    default:
      return `(${lead}, ${year}${page ? `, p. ${page}` : ''})`
  }
}

export function sortSources(list: Source[], style: string): Source[] {
  if (style === 'ieee') return list
  return [...list].sort((a, b) => (names(a)[0]?.last || a.title).localeCompare(names(b)[0]?.last || b.title))
}

export function formatBibliographyEntry(s: Source, style: string, index: number, html = false): string {
  const ns = names(s)
  const it = (t: string): string => (html ? `<i>${esc(t)}</i>` : t)
  const e = (t: string): string => (html ? esc(t) : t)
  const year = s.year || 'n.d.'
  const container = s.journal ? `${it(s.journal)}${s.volume ? `, ${e(s.volume)}` : ''}${s.pages ? `, ${e(s.pages)}` : ''}` : ''
  const pub = [s.city, s.publisher].filter(Boolean).join(': ')
  const url = s.url ? ` ${e(s.url)}` : ''
  switch (style) {
    case 'mla': {
      const a = ns.length ? `${ns[0].last}, ${ns[0].first}${ns.length === 2 ? `, and ${ns[1].first} ${ns[1].last}` : ns.length > 2 ? ', et al' : ''}. ` : ''
      return `${e(a)}${s.journal ? `"${e(s.title)}." ${container}, ${e(year)}` : `${it(s.title)}. ${e(s.publisher)}, ${e(year)}`}.${url}`
    }
    case 'chicago': {
      const a = ns.map((n, i) => (i === 0 ? `${n.last}, ${n.first}` : `${n.first} ${n.last}`)).join(', ')
      return `${e(a)}${a ? '. ' : ''}${e(year)}. ${s.journal ? `"${e(s.title)}." ${container}` : `${it(s.title)}. ${e(pub)}`}.${url}`
    }
    case 'ieee': {
      const a = ns.map((n) => `${initials(n.first)} ${n.last}`).join(', ')
      return `[${index + 1}] ${e(a)}, ${s.journal ? `"${e(s.title)}," ${container}` : `${it(s.title)}. ${e(pub)}`}, ${e(year)}.${url}`
    }
    case 'harvard': {
      const a = ns.map((n) => `${n.last}, ${initials(n.first)}`).join(', ')
      return `${e(a)} (${e(year)}) ${s.journal ? `'${e(s.title)}', ${container}` : `${it(s.title)}. ${e(pub)}`}.${url}`
    }
    default: {
      const a = ns.map((n) => `${n.last}, ${initials(n.first)}`)
      const auth = a.length > 1 ? `${a.slice(0, -1).join(', ')}, & ${a[a.length - 1]}` : a.join('')
      return `${e(auth)} (${e(year)}). ${s.journal ? `${e(s.title)}. ${container}` : `${it(s.title)}. ${e(s.publisher)}`}.${url}`
    }
  }
}

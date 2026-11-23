import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { renderChartSvg, type ChartData } from '@/lib/chart'
import { useApp } from '@/state/store'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      insertChart: (data: ChartData) => ReturnType
    }
  }
}

export const Chart = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (el) => {
          try {
            return JSON.parse((el as HTMLElement).getAttribute('data-chart') || 'null')
          } catch {
            return null
          }
        },
        renderHTML: (a) => ({ 'data-chart': JSON.stringify(a.data) })
      }
    }
  },
  parseHTML() {
    return [{ tag: 'figure[data-chart]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    const data = node.attrs.data as ChartData | null
    const src = data ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderChartSvg(data))}` : ''
    return ['figure', { ...HTMLAttributes, class: 'pe-chart' }, ['img', { src, width: data?.width ?? 560 }]]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('figure')
      dom.className = 'pe-chart'
      dom.contentEditable = 'false'
      let current: PMNode = node
      const render = (): void => {
        const data = current.attrs.data as ChartData | null
        dom.innerHTML = data ? renderChartSvg(data) : ''
        const svg = dom.querySelector('svg')
        if (svg) {
          svg.style.maxWidth = '100%'
          svg.style.height = 'auto'
        }
      }
      render()
      dom.addEventListener('dblclick', () => useApp.getState().openDialog('chart', { edit: true }))
      return {
        dom,
        update(n: PMNode) {
          if (n.type.name !== 'chart') return false
          current = n
          render()
          return true
        },
        ignoreMutation: () => true
      }
    }
  },
  addCommands() {
    return {
      insertChart:
        (data) =>
        ({ chain }) =>
          chain().insertContent([{ type: 'chart', attrs: { data } }, { type: 'paragraph' }]).run()
    }
  }
})

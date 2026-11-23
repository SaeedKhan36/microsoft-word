import { Node, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { fileToDataUrl } from '@/lib/images'
import { useApp } from '@/state/store'

export type ImageLayout = 'inline' | 'center' | 'left' | 'right' | 'float-left' | 'float-right'
export type ImageStyle = 'none' | 'border' | 'shadow' | 'rounded' | 'circle' | 'polaroid' | 'frame'

export interface ImageAttrs {
  src: string
  alt?: string
  title?: string
  width?: number | null
  layout?: ImageLayout
  imgStyle?: ImageStyle
  rotate?: number
  shape?: string | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    peImage: {
      insertImage: (attrs: ImageAttrs) => ReturnType
      updateImage: (attrs: Partial<ImageAttrs>) => ReturnType
    }
  }
}

class ImageView implements NodeView {
  dom: HTMLElement
  img: HTMLImageElement
  private node: PMNode

  constructor(
    node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.node = node
    this.dom = document.createElement('span')
    this.img = document.createElement('img')
    this.img.draggable = false
    this.dom.appendChild(this.img)
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const h = document.createElement('span')
      h.className = `pe-img-handle pe-img-handle-${corner}`
      h.addEventListener('pointerdown', (e) => this.startResize(e, corner))
      this.dom.appendChild(h)
    }
    this.dom.addEventListener('dblclick', () => {
      useApp.getState().openDialog('imageProps')
    })
    this.render()
  }

  private render(): void {
    const a = this.node.attrs
    this.dom.className = `pe-img pe-img-${a.layout || 'inline'} pe-img-style-${a.imgStyle || 'none'}`
    this.dom.setAttribute('data-pe-image', '')
    this.dom.style.width = a.width ? `${a.width}px` : ''
    if (this.img.getAttribute('src') !== a.src) this.img.src = a.src
    this.img.alt = a.alt || ''
    this.img.title = a.title || ''
    this.img.style.transform = a.rotate ? `rotate(${a.rotate}deg)` : ''
  }

  private startResize(e: PointerEvent, corner: string): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const rect = this.dom.getBoundingClientRect()
    const scale = rect.width / (this.dom.offsetWidth || rect.width) || 1
    const startW = this.dom.offsetWidth
    const ratio = (this.img.naturalHeight || 1) / (this.img.naturalWidth || 1)
    const maxW = (this.view.dom as HTMLElement).clientWidth
    const dir = corner.includes('w') ? -1 : 1
    let width = startW
    const move = (ev: PointerEvent): void => {
      const dx = ((ev.clientX - startX) / scale) * dir * (this.node.attrs.layout === 'center' ? 2 : 1)
      width = Math.max(24, Math.min(maxW, startW + dx))
      this.dom.style.width = `${width}px`
      this.dom.dataset.size = `${Math.round(width)} × ${Math.round(width * ratio)} px`
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      delete this.dom.dataset.size
      const pos = this.getPos()
      if (pos === undefined) return
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, width: Math.round(width) }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.render()
    return true
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode')
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode')
  }

  stopEvent(e: Event): boolean {
    return (e.target as HTMLElement)?.classList?.contains('pe-img-handle') ?? false
  }

  ignoreMutation(): boolean {
    return true
  }
}

async function insertFiles(view: EditorView, files: File[], pos?: number): Promise<void> {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const src = await fileToDataUrl(f)
    const node = view.state.schema.nodes.image.create({ src, alt: f.name.replace(/\.[^.]+$/, '') })
    const at = pos ?? view.state.selection.from
    view.dispatch(view.state.tr.insert(Math.min(at, view.state.doc.content.size), node))
  }
}

export const PeImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      title: { default: '' },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = parseFloat((el as HTMLElement).getAttribute('width') || (el as HTMLElement).style.width || '')
          return Number.isFinite(w) && w > 0 ? w : null
        }
      },
      layout: { default: 'inline', parseHTML: (el) => (el as HTMLElement).getAttribute('data-layout') || 'inline' },
      imgStyle: { default: 'none', parseHTML: (el) => (el as HTMLElement).getAttribute('data-style') || 'none' },
      rotate: { default: 0, parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-rotate')) || 0 },
      shape: { default: null, parseHTML: (el) => (el as HTMLElement).getAttribute('data-shape') }
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        src: a.src,
        alt: a.alt,
        width: a.width ?? undefined,
        'data-layout': a.layout,
        'data-style': a.imgStyle,
        'data-rotate': a.rotate || undefined,
        'data-shape': a.shape || undefined,
        class: `pe-img-static pe-img-${a.layout} pe-img-style-${a.imgStyle}`,
        style: a.rotate ? `transform: rotate(${a.rotate}deg)` : undefined
      })
    ]
  },

  addNodeView() {
    return ({ node, view, getPos }) => new ImageView(node, view, getPos as () => number | undefined)
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: 'image', attrs }),
      updateImage:
        (attrs) =>
        ({ tr, state, dispatch }) => {
          const sel = state.selection as unknown as { node?: PMNode; from: number }
          if (!sel.node || sel.node.type.name !== 'image') return false
          if (dispatch) tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, ...attrs })
          return true
        }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
            const html = event.clipboardData?.getData('text/html')
            if (!files.length || html) return false
            event.preventDefault()
            void insertFiles(view, files)
            return true
          },
          handleDrop(view, event) {
            const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
            if (!files.length) return false
            event.preventDefault()
            const coords = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })
            void insertFiles(view, files, coords?.pos)
            return true
          }
        }
      })
    ]
  }
})

import type { ReactNode } from 'react'
import { useApp } from '@/state/store'
import { FontDialog, ParagraphDialog, LinkDialog, SymbolDialog, DateTimeDialog, WordCountDialog, FootnoteDialog, BookmarkDialog, CaptionDialog, GotoDialog, PromptDialog, ZoomDialog } from './TextDialogs'
import { PageSetupDialog, WatermarkDialog, PageBorderDialog, TableDialog, PasswordDialog, SetPasswordDialog } from './PageDialogs'
import { EquationDialog, ChartDialog, ImagePropsDialog, InsertPictureDialog, ShapesDialog, IconsDialog, SourcesDialog, CompareDialog } from './InsertDialogs'
import { HandwritingDialog } from './HandwritingDialog'

import { MailMerge, AddressDocument, Accessibility, Shortcuts } from './OfficeDialogs'

export function Dialogs(): ReactNode {
  const dialog = useApp((s) => s.dialog)
  if (!dialog) return null
  const close = (): void => useApp.getState().closeDialog()
  const p = dialog.props ?? {}
  switch (dialog.type) {
    case 'envelope':
    case 'labels':
      return <AddressDocument labels={dialog.type === 'labels'} onClose={close} />
    case 'mailMerge':
      return <MailMerge onClose={close} />
    case 'shortcuts':
      return <Shortcuts onClose={close} />
    case 'accessibility':
      return <Accessibility onClose={close} />
    case 'font':
      return <FontDialog onClose={close} />
    case 'paragraph':
      return <ParagraphDialog onClose={close} />
    case 'link':
      return <LinkDialog onClose={close} />
    case 'symbol':
      return <SymbolDialog onClose={close} />
    case 'datetime':
      return <DateTimeDialog onClose={close} />
    case 'wordCount':
      return <WordCountDialog onClose={close} />
    case 'footnote':
      return <FootnoteDialog onClose={close} id={String(p.id)} isNew={!!p.isNew} />
    case 'bookmark':
      return <BookmarkDialog onClose={close} />
    case 'caption':
      return <CaptionDialog onClose={close} />
    case 'goto':
      return <GotoDialog onClose={close} />
    case 'prompt':
      return <PromptDialog onClose={close} kind={String(p.kind)} />
    case 'zoom':
      return <ZoomDialog onClose={close} />
    case 'pageSetup':
      return <PageSetupDialog onClose={close} />
    case 'watermark':
      return <WatermarkDialog onClose={close} />
    case 'pageBorder':
      return <PageBorderDialog onClose={close} />
    case 'table':
      return <TableDialog onClose={close} />
    case 'password':
      return <PasswordDialog onClose={close} path={String(p.path)} wrong={!!p.wrong} />
    case 'setPassword':
      return <SetPasswordDialog onClose={close} />
    case 'equation':
      return <EquationDialog onClose={close} mode={(p.mode as 'inline' | 'block') ?? 'block'} latex={p.latex as string | undefined} pos={p.pos as number | undefined} />
    case 'chart':
      return <ChartDialog onClose={close} edit={!!p.edit} />
    case 'imageProps':
      return <ImagePropsDialog onClose={close} />
    case 'insertPicture':
      return <InsertPictureDialog onClose={close} replace={!!p.replace} />
    case 'shapes':
      return <ShapesDialog onClose={close} />
    case 'icons':
      return <IconsDialog onClose={close} />
    case 'sources':
      return <SourcesDialog onClose={close} insert={!!p.insert} />
    case 'compare':
      return <CompareDialog onClose={close} />
    case 'handwriting':
      return <HandwritingDialog onClose={close} source={(p.source as 'ink' | 'image') ?? 'image'} pos={p.pos as number | undefined} />
    default:
      return null
  }
}

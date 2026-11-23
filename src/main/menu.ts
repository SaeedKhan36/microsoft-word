import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/**
 * The macOS menu bar. On Windows the app uses its own ribbon and title bar, so no menu is shown there.
 * Items handled by the editor send a command id to the window; their shortcuts are shown in the
 * menu but not registered, so the keystrokes still reach the editor.
 */
export function installMenu(getWindow: () => BrowserWindow | null): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const send = (id: string) => () => getWindow()?.webContents.send('menu:command', id)
  const item = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    click: send(id),
    accelerator,
    registerAccelerator: false
  })
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        item('About Personal Editor', 'app.about'),
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: send('app.options') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        item('New', 'file.new', 'Cmd+N'),
        item('New from Template…', 'file.newFrom'),
        item('Open…', 'file.open', 'Cmd+O'),
        item('Open Recent…', 'file.recent'),
        { type: 'separator' },
        item('Save', 'file.save', 'Cmd+S'),
        item('Save As…', 'file.saveAs', 'Shift+Cmd+S'),
        item('Export as PDF…', 'file.pdf'),
        item('Export as Word (.docx)…', 'file.docx'),
        { type: 'separator' },
        item('Print…', 'file.print', 'Cmd+P'),
        { type: 'separator' },
        item('Close Document', 'file.close', 'Cmd+W')
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'edit.undo', 'Cmd+Z'),
        item('Redo', 'edit.redo', 'Shift+Cmd+Z'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        item('Paste as Plain Text', 'edit.pasteText', 'Shift+Cmd+V'),
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find…', 'edit.find', 'Cmd+F'),
        item('Replace…', 'edit.replace', 'Shift+Cmd+H'),
        { type: 'separator' },
        { label: 'Speech', submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }] }
      ]
    },
    {
      label: 'Format',
      submenu: [
        item('Bold', 'fmt.bold', 'Cmd+B'),
        item('Italic', 'fmt.italic', 'Cmd+I'),
        item('Underline', 'fmt.underline', 'Cmd+U'),
        item('Strikethrough', 'fmt.strike'),
        { type: 'separator' },
        item('Font…', 'fmt.font', 'Cmd+D'),
        item('Paragraph…', 'fmt.paragraph'),
        { type: 'separator' },
        item('Heading 1', 'para.h1', 'Alt+Cmd+1'),
        item('Heading 2', 'para.h2', 'Alt+Cmd+2'),
        item('Heading 3', 'para.h3', 'Alt+Cmd+3'),
        item('Normal Text', 'para.normal'),
        { type: 'separator' },
        item('Clear Formatting', 'fmt.clear')
      ]
    },
    {
      label: 'Insert',
      submenu: [
        item('Table…', 'ins.table'),
        item('Picture…', 'ins.picture'),
        item('Link…', 'ins.link', 'Cmd+K'),
        item('Equation…', 'ins.equation'),
        item('Drawing Canvas', 'ins.ink'),
        item('Handwriting from Image…', 'ins.handwriting'),
        { type: 'separator' },
        item('Page Break', 'ins.pagebreak', 'Cmd+Enter'),
        item('Footnote', 'ins.footnote', 'Alt+Cmd+F'),
        item('Comment', 'ins.comment', 'Alt+Cmd+M'),
        item('Table of Contents', 'ins.toc')
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Print Layout', 'view.print'),
        item('Web Layout', 'view.web'),
        item('Read Mode', 'view.read'),
        item('Focus Mode', 'view.focus'),
        { type: 'separator' },
        item('Navigation Pane', 'view.nav'),
        item('Ruler', 'view.ruler'),
        { type: 'separator' },
        item('Zoom In', 'view.zoomIn'),
        item('Zoom Out', 'view.zoomOut'),
        item('Actual Size', 'view.zoom100'),
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Search Commands', 'app.palette', 'Alt+Q'),
        item('Keyboard Shortcuts', 'app.about'),
        { label: 'Project on GitHub', click: () => void shell.openExternal('https://github.com/SaeedKhan36/microsoft-word') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

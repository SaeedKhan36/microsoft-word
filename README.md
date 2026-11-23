<img src="assets/icon.svg" width="64" height="64" alt="">

# Personal Editor

A personal, offline word processor for Windows. It does what Word does, with a cleaner interface, pen and handwriting support, and extras Word doesn't have. Everything stays on your PC.

## Install on Windows

### Option A: build the installer on your Windows PC (recommended)

1. Install **Node.js 22 LTS** (https://nodejs.org) and **Git**.
2. Open *PowerShell* in this folder and run:

   ```powershell
   npm install
   npm run build:win
   ```

3. In the `dist` folder you'll find:
   - `Personal-Editor-Setup-1.0.0.exe`: the installer. You choose the folder, and it adds Start Menu and desktop shortcuts and opens `.ped` files on double-click.
   - `Personal-Editor-Portable-1.0.0.exe`: the portable version, which runs without installing.
4. Run the installer. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This appears once, because the app isn't code-signed (signing isn't needed for personal use).

### Option B: GitHub (no setup on your PC)

Push this repository to GitHub, open **Actions → Build Windows installer → Run workflow**, then download the `.exe` from the finished run.

### Option C: ready-made zip

`npm run build:win-zip` (this works on Linux or Mac too) creates `dist/Personal-Editor-1.0.0-win-x64.zip`. Unzip it anywhere on Windows and run `Personal Editor.exe`.

## Develop

```bash
npm install
npm run dev        # run with hot reload
npm run typecheck  # TypeScript checks
npm run build      # production bundles in out/
```

## What's inside

- **Real A4 pages**, with headers, footers, page numbers, footnotes at the bottom of each page, watermarks, page borders, page colors, line numbers, and margins you can drag on the ruler.
- **Every Word ribbon tab:**
  - **File:** Start screen, templates, open/save, print with live preview, export, options.
  - **Home:** fonts, styles gallery, lists, alignment, spacing, shading, borders, format painter, change case, find & replace.
  - **Insert:** tables, pictures, shapes, 1,600+ icons, charts, links, bookmarks, cover page, text boxes, callouts, columns, equations, symbols, date and time.
  - **Draw:** pens, pencil, highlighter, eraser, ink to text, ink to shape, ink replay.
  - **Design:** document themes, colors, fonts, paragraph spacing.
  - **Layout:** margins, orientation, paper size, columns, breaks, line numbers, hyphenation, indents and spacing.
  - **References:** table of contents, footnotes, citations and bibliography (APA, MLA, Chicago, Harvard, IEEE), captions, table of figures.
  - **Review:** spelling, word count and readability, read aloud, comments with replies, track changes, compare documents, restrict editing, encryption, version history.
  - **View:** read mode, print layout, web layout, focus mode, zoom, dark mode.
- **Files:**
  - Opens `.ped`, `.docx`, `.md`, `.html` and `.txt`.
  - Saves and exports `.ped`, `.docx`, `.pdf`, `.html`, `.md` and `.txt`.
- **Handwriting:**
  - Write with a pen, finger or mouse in drawing canvases, with pressure and palm rejection.
  - Import photos of handwritten notes as a picture, editable ink, or typed text.
  - Text recognition runs offline on your PC, with a fast model and an accurate one. AI recognition is optional and needs your own Claude API key.
- **Never lose work:**
  - Crash recovery every couple of seconds.
  - Automatic version history with preview and restore.
  - AutoSave for `.ped` files.
  - Saves are written safely, so a crash mid-save can't damage the file.
- **Extras:**
  - Search all commands with Alt+Q.
  - Type `/` on an empty line to insert anything.
  - Several documents open in tabs.
  - Search inside all your documents.
  - A writing goal with a progress ring.
  - A floating formatting toolbar.

## Cost

$0. Everything is open source and runs locally. The only optional paid feature is AI handwriting recognition, which uses your own Claude API key and costs a fraction of a cent per page.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

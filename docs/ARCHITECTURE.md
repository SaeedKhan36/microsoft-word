# Personal Editor — End-to-End Architecture & Build Plan

**What we're building:** a personal word processor for Windows that does everything Microsoft Word does that matters, with a cleaner modern UI, real pen and handwriting support, and extras Word doesn't have. It installs from our own `.exe`, runs fully offline, and costs nothing.

**Decisions locked in**

| Decision | Choice |
|---|---|
| App name | **Personal Editor** |
| Document file extension | **`.ped`** |
| Default page | **A4** (210 × 297 mm), 2.54 cm margins, portrait |
| Default text | 11 pt, 1.15 line spacing, 8 pt after paragraph (Word's "Normal" style) |
| Platform | Windows 10/11 (64-bit). Code also runs on Mac for development. |
| Backend | **None.** Local files + one local SQLite database |
| Cloud / account | None. Works fully offline |
| Language | TypeScript everywhere |


> **As built (v1.0):** the app follows this plan, with these simplifications:
> - Local data (settings, recent files, search index, recovery) is kept in small JSON files in `%APPDATA%\Personal Editor\`, not SQLite, so the app has no native modules and builds anywhere.
> - Version history is saved as compressed snapshots in `versions\<docId>\`.
> - DOCX, Markdown and PDF conversion run in the renderer.
> - The heavy worker process wasn't needed; handwriting recognition runs in a WebAssembly worker.

---

## 1. Goals and non-goals

**Goals**
1. Feel like Word, so nothing needs re-learning: ribbon, pages, Ctrl+S, Ctrl+P.
2. Look and feel better: modern Windows 11 style, dark mode, fast, uncluttered.
3. Never lose work: autosave, crash recovery, full version history.
4. First-class pen and handwriting support.
5. Open and save `.docx` so you can exchange files with people who use Word.
6. $0 to build, install and run.

**Non-goals (for now)**
- Real-time collaboration and cloud sync. These could be added later with Convex.
- Publishing to the Microsoft Store.
- Macros and VBA, mail merge. Could come later.
- Pixel-perfect rendering of every complex Word file. No free tool does this.

---

## 2. What it costs

| Item | Cost |
|---|---|
| Electron, React, TipTap core, SQLite and every library in this plan | **$0** (open source) |
| Building the `.exe` and installing it on your PC | **$0** |
| Running it: no server, no database hosting, no subscription | **$0** |
| Microsoft Store / developer account | **Not needed** |
| Code-signing certificate | **Not needed.** Without it you get a one-time "Windows protected your PC" warning: click **More info → Run anyway** |
| GitHub Actions to build the Windows `.exe` (optional) | **$0** (free tier) |
| Handwriting: Windows built-in recognition, local AI model | **$0** |
| **Optional** cloud AI (rewrite, summarise, read messy handwriting) | Pay-per-use, small. Only if you switch it on and add an API key. You can set a monthly cap. |

**Bottom line: $0.** The only possible cost is the optional AI add-on, which is off by default.

> ⚠️ TipTap (our editor engine) is free, but a few of its *official* extensions are paid:
> Pages/pagination, DOCX conversion, Comments, Track Changes and AI.
> **We don't use them.** We build our own or use free libraries.

---

## 3. Big picture

An Electron app has three parts that talk to each other:

```
┌─────────── Personal Editor.exe ───────────┐
│                                           │
│  RENDERER  (React UI, what you see)       │
│   ribbon · pages · editor · ink · dialogs │
│              │  typed, safe calls         │
│  PRELOAD   (bridge: window.pe API)        │
│              │                            │
│  MAIN      (Node.js, the "backend")       │
│   files · SQLite · print · PDF · fonts    │
│              │                            │
│  WORKER    (utilityProcess)               │
│   DOCX convert · OCR · search indexing    │
└──────────────┼────────────────────────────┘
               ▼  your PC only
  Documents\*.ped            your documents
  %APPDATA%\Personal Editor\
     app.db                  settings, recents,
                             versions, search
     recovery\               crash recovery
     models\                 handwriting model
```

- **Renderer:** everything visual. It never touches the disk directly.
- **Preload:** exposes a small, typed API (`window.pe.*`) to the renderer. It's the only way in.
- **Main:** owns the window, files, database, printing and menus.
- **Worker:** heavy jobs (DOCX conversion, handwriting recognition, indexing) run in a separate Electron `utilityProcess` so typing never lags.

---

## 4. Tech stack

All free and open source.

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Electron** (latest stable) + **electron-vite** | Same tooling as your Mac apps. Windows 11 Mica and title-bar overlay support |
| Language | **TypeScript** (strict) | One language for every part |
| UI | **React 19**, **Tailwind CSS**, **Radix UI** (via shadcn/ui), **lucide** icons | Fast to build, accessible, modern |
| UI font | **Segoe UI Variable** (built into Windows) | Native Windows look |
| Editor engine | **TipTap (open-source core) on ProseMirror** | Proven rich-text engine, fully extensible |
| State | **Zustand** | Small and simple |
| Validation | **zod** | Checks every message between processes |
| Local database | **better-sqlite3** + FTS5 | One file, very fast, full-text search |
| File container | **JSZip** | `.ped` is a zip, like `.docx` |
| DOCX | **docx** (export), **mammoth** (import), plus our own XML pass for page setup and headers | Free |
| PDF | Electron `printToPDF` + **pdf.js** (preview) | Built in |
| Equations | **MathLive** (editing) + **KaTeX** (display) | Type LaTeX or click visually |
| Charts | **ECharts** | Charts from a small data grid |
| Ink | Pointer Events + **perfect-freehand** | Smooth, pressure-sensitive strokes |
| Handwriting → text | Windows handwriting panel · **transformers.js + TrOCR** (local) · optional AI | See §13 |
| Image cleanup | **OpenCV.js** | Crop, straighten and clean photos of handwriting |
| Spelling | Electron's built-in spellchecker (uses Windows' own) | Free, offline |
| Grammar (later) | **LanguageTool** | Optional |
| Packaging | **electron-builder** → NSIS installer + portable `.exe` | Install like any Windows app |
| Tests | **Vitest** (logic), **Playwright** (drives the real app) | |
| Code quality | ESLint, Prettier, TypeScript strict | |

---

## 5. Project layout

```
personal-editor/
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml     installer, icon, .ped association
├─ build/                   icon.ico, installer art
├─ resources/               bundled fonts, templates
├─ docs/ARCHITECTURE.md     this file
├─ tests/
│  ├─ unit/                 Vitest
│  └─ e2e/                  Playwright
└─ src/
   ├─ shared/               used by every process
   │  ├─ ipc.ts             API contract (zod)
   │  ├─ schema.ts          document nodes & marks
   │  ├─ ped-format.ts      .ped types + migrations
   │  └─ units.ts           mm ↔ pt ↔ px ↔ twips
   ├─ main/
   │  ├─ index.ts           lifecycle, single instance
   │  ├─ window.ts          window, Mica, title bar
   │  ├─ menu.ts            right-click & app menus
   │  ├─ ipc/               one handler file per area
   │  └─ services/
   │     ├─ files.ts        open/save, atomic writes
   │     ├─ db.ts           SQLite + migrations
   │     ├─ versions.ts     snapshots & retention
   │     ├─ recovery.ts     crash recovery
   │     ├─ search.ts       library-wide search
   │     ├─ print.ts        printers, print, PDF
   │     └─ fonts.ts        installed Windows fonts
   ├─ worker/               utilityProcess
   │  ├─ docx-import.ts
   │  ├─ docx-export.ts
   │  ├─ ocr.ts             TrOCR handwriting model
   │  └─ indexer.ts
   ├─ preload/index.ts      window.pe API
   └─ renderer/
      ├─ App.tsx
      ├─ screens/           Start, Editor, Backstage
      ├─ shell/             TitleBar, DocTabs, Ribbon,
      │                     StatusBar, Sidebars
      ├─ ribbon/tabs/       Home, Insert, Draw, Design,
      │                     Layout, References, Review,
      │                     View + contextual tabs
      ├─ editor/
      │  ├─ Editor.tsx
      │  ├─ extensions/     one folder per feature
      │  ├─ pagination/     page engine (§12.1)
      │  ├─ track-changes/
      │  ├─ ink/            canvas, tools, recognition
      │  └─ commands/       command registry
      ├─ dialogs/           Font, Paragraph, PageSetup,
      │                     FindReplace, Table, Symbol…
      ├─ panels/            Navigation, Comments,
      │                     Versions, Styles, Format
      ├─ stores/            zustand
      └─ styles/            tokens, themes
```

**Command registry (key rule).** Every action (Bold, Insert Table, Print…) is defined once in `editor/commands/` with:
`id`, `label`, `icon`, `shortcut`, `isEnabled()`, `isActive()` and `run()`.
The ribbon, right-click menus, keyboard shortcuts, the search box (Alt+Q) and the slash menu all read from this one list. Every feature is automatically reachable from everywhere, and the shortcuts never drift out of sync.

---

## 6. Process responsibilities & API

The renderer calls `window.pe.<area>.<action>()`. Every call is validated with zod in main.

| Area | Calls |
|---|---|
| `file` | `open(path?)`, `save(docId, data)`, `saveAs(data)`, `close(docId)`, `reveal(path)` |
| `convert` | `importDocx(path)`, `exportDocx(data, path)`, `exportPdf(opts)`, `exportMarkdown`, `exportHtml`, `exportTxt` |
| `print` | `getPrinters()`, `preview(opts) → PDF bytes`, `run(opts)` |
| `fonts` | `list()` (all installed Windows fonts) |
| `recent` | `list()`, `pin(id)`, `remove(id)` |
| `versions` | `list(docId)`, `get(versionId)`, `create(docId, label?)`, `restore(versionId)` |
| `recovery` | `write(docId, data)`, `list()`, `discard(docId)` |
| `search` | `query(text)` → matches across all documents |
| `settings` | `get(key)`, `set(key, value)` |
| `ink` | `recognize(image or strokes, engine)` → text + confidence |
| `templates` | `list()`, `saveAsTemplate(data)`, `newFrom(id)` |
| Events (main → UI) | `onOpenFile(path)` (double-clicked file), `onBeforeQuit`, `onThemeChange` |

---

## 7. Document model

The document is a ProseMirror tree saved as JSON. Internally we measure in **points** (1 in = 72 pt; DOCX uses twips = 1/20 pt).

**Block nodes**

| Node | Notes |
|---|---|
| `paragraph` | style, align, indents (left, right, first line, hanging), spacing before/after, line spacing, keep-with-next, page-break-before, shading, borders |
| `heading` (1–6) | feeds the Navigation pane and table of contents |
| `bulletList` / `orderedList` / `listItem` | multilevel, custom bullet/number formats, restart numbering |
| `taskList` / `taskItem` | checklists ★ |
| `table` / `tableRow` / `tableCell` / `tableHeader` | merge, widths, borders, shading, repeat header row |
| `image` / `figure` + `caption` | inline or floating, wrap, crop, rotate, alt text |
| `textBox`, `shape` | floating, anchored to a paragraph |
| `chart` | data + chart type (ECharts) |
| `mathBlock` | display equation |
| `inkBlock` | handwriting/drawing area inside the text flow |
| `codeBlock` | with syntax highlighting ★ |
| `callout` | info, warning or tip boxes ★ |
| `blockquote`, `horizontalRule` | |
| `pageBreak`, `columnBreak` | |
| `sectionBreak` | carries its own page size, orientation, margins, columns, headers/footers |
| `tableOfContents` | auto-generated from headings |
| `footnotes` / `endnotes` | containers at the end of the document |

**Inline nodes & marks**

| Item | Notes |
|---|---|
| `bold`, `italic`, `underline` (styles), `strike`, `subscript`, `superscript` | |
| `textStyle` | font family, size, colour, letter spacing, caps, small caps |
| `highlight` | colour |
| `link`, `bookmark`, `crossReference` | |
| `mathInline` | |
| `footnoteRef` | number auto-updates |
| `field` | page number, page count, date, author, title |
| `comment` | thread id |
| `insertion` / `deletion` | track changes (author, time) |
| `hardBreak` (Shift+Enter), `tab` | |

---

## 8. Storage

### 8.1 The `.ped` file

A zip file, like `.docx`:

```
Essay.ped
├─ manifest.json   format, version, docId (UUID),
│                  created, modified, appVersion
├─ content.json    the document tree
├─ page.json       size, orientation, margins,
│                  columns, headers/footers, watermark
├─ styles.json     Normal, Heading 1–6, Title, …
├─ comments.json   threads
├─ ink/*.json      pen strokes (points, pressure,
│                  colour, width, tool)
├─ media/*         images & embedded files
└─ thumbnail.png   for the Start screen
```

- **Atomic save:** write `Essay.ped.tmp`, flush, then rename over the original. A crash or power cut can never corrupt a file.
- **`docId` (UUID)** ties a document to its version history even if you rename or move it.
- **`version` + migrations:** old files open forever.
- **Also supported:** open/save `.docx`, open `.txt`/`.md`/`.html`, export `.pdf`.

### 8.2 Local database: `%APPDATA%\Personal Editor\app.db`

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,        -- docId
  path TEXT, title TEXT,
  word_count INTEGER, thumbnail BLOB,
  last_opened INTEGER, pinned INTEGER DEFAULT 0);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY,
  doc_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reason TEXT,                -- auto | save | manual | restore
  label TEXT,
  content BLOB NOT NULL);     -- gzipped .ped snapshot

CREATE TABLE recovery (
  doc_id TEXT PRIMARY KEY,
  path TEXT, updated_at INTEGER,
  content BLOB NOT NULL);

CREATE VIRTUAL TABLE search_fts
  USING fts5(doc_id UNINDEXED, title, body);

CREATE TABLE templates (
  id TEXT PRIMARY KEY, name TEXT,
  content BLOB, created_at INTEGER);
```

**Version retention:** keep every snapshot from the last 24 h, then one per hour for a week, then one per day. Manually named versions are kept forever.

---

## 9. Key flows

**Open a file**
1. Double-click `Essay.ped` → Windows starts Personal Editor (or the running copy receives it through the single-instance lock).
2. Main reads the zip, validates it, migrates it if old, and sends it to the UI.
3. The UI opens it in a new tab. Main updates `documents` and the search index.

**Typing & autosave**
1. Every edit updates the editor state instantly (no disk access).
2. 2 s after you stop typing, the UI sends the document to `recovery.write` (crash safety).
3. Every 5 minutes of editing, a `versions` snapshot is taken automatically.
4. If **AutoSave** is on (default for files already saved), the real file is also saved atomically.

**Crash recovery**
On start, if `recovery` holds anything newer than its file, the Start screen shows *"Recovered documents"* with **Restore** and **Discard**.

**Print**
1. Ctrl+P opens the Print screen: settings on the left, live preview on the right.
2. Preview: the document is rendered in a hidden window with print CSS (`@page` A4 + margins) → `printToPDF` → shown with pdf.js.
3. Print: `webContents.print({ deviceName, copies, pageRanges, duplexMode, color, landscape })`.

**Export PDF:** same pipeline as print, saved to a file. Headings become PDF bookmarks.

**DOCX import:** worker runs mammoth plus our own pass for page size/margins/headers → document JSON → opens as a new **unsaved** document, with a notice listing anything simplified.

**DOCX export:** worker maps our nodes to `docx` objects (styles, lists, tables, images, sections, headers/footers, fields, footnotes, comments) → `.docx`.

**Handwriting from a photo:** see §13.

**Library search:** typing in the Start screen search box queries `search_fts` and shows matching documents with highlighted snippets.

**Restore a version:** the Versions panel shows a timeline; clicking one shows it read-only with changes highlighted; **Restore** first snapshots the current state, then replaces it, so restoring can itself be undone.

---

## 10. UI design

**Window layout (top to bottom)**

1. **Title bar:** app icon · Save/Undo/Redo · **document tabs** · search box (*Alt+Q: "What do you want to do?"*) · Windows controls. Uses Windows 11 Mica.
2. **Ribbon:** File · Home · Insert · Draw · Design · Layout · References · Review · View.
   - Can collapse to a **single-line simplified ribbon**, or be hidden (Ctrl+F1).
   - **Contextual tabs** appear only when needed: Table, Picture, Shape, Header & Footer, Equation, Ink.
3. **Workspace:**
   - **Left panel:** Navigation (headings, drag to reorder sections), page thumbnails, search results.
   - **Centre:** soft grey desk with A4 pages (shadowed), horizontal + vertical ruler.
   - **Right panel:** Comments · Versions · Styles · Format (selected picture/shape/table) · Handwriting review.
4. **Status bar:** Page 3 of 12 · 1,284 words · language · Track Changes on/off · view switcher · zoom slider.

**Small touches**
- A floating **mini toolbar** appears above selected text (like Word).
- Right-click menus show the most relevant actions for what's under the mouse.
- A **slash menu**: type `/` on an empty line → insert anything.
- Markdown shortcuts: `# ` heading, `- ` bullet, `1. ` numbered, `> ` quote, `**bold**`.
- Smooth, subtle animations; respects Windows' "reduce motion" setting.

**Themes:** Light, Dark (pages can stay white or go dark), Sepia, plus an accent colour that follows Windows.

**Start screen:** New blank, Templates (letter, CV, essay, report, notes, assignment), Recent (thumbnails, pinned), Recovered documents, search across all documents.

**Keyboard shortcuts:** all the standard Word ones, so muscle memory works:

| Keys | Action |
|---|---|
| Ctrl+N / O / S / Shift+S / P / W | New, Open, Save, Save As, Print, Close |
| Ctrl+Z / Y | Undo / Redo |
| Ctrl+B / I / U | Bold / Italic / Underline |
| Ctrl+L / E / R / J | Align left / centre / right / justify |
| Ctrl+Alt+1 / 2 / 3 | Heading 1 / 2 / 3 |
| Ctrl+Shift+> / < | Bigger / smaller font |
| Ctrl+F / H | Find / Replace |
| Ctrl+K | Insert link |
| Ctrl+Enter | Page break |
| Ctrl+Tab | Next document tab |
| Alt+Q | Search commands ★ |
| Ctrl+Shift+D | Draw mode on/off ★ |
| F11 | Focus mode ★ |

---

## 11. Features (Word parity + extras)

★ = something Word doesn't have, or does worse.

**File (Backstage):** New, Templates, Open, Recent, Save, Save As, Export (PDF, DOCX, Markdown, HTML, TXT), Print, Properties (author, title, tags), ★ Version history, ★ Recovered documents, Options.

**Home:**
- Clipboard: cut, copy, paste, paste special (keep formatting / text only), format painter.
- Font: every installed Windows font, size, bold/italic/underline styles, strike, sub/superscript, colour, highlight, change case, clear formatting, Font dialog.
- Paragraph: bullets, numbering, multilevel lists, indent, alignment, line & paragraph spacing, shading, borders, sort, show/hide ¶.
- Styles gallery + create/modify styles.
- Find, Replace, Go To (★ regex, match case, whole word, highlight all).

**Insert:** cover page, blank page, page break, section break, table (grid picker, draw, convert text ↔ table), pictures (file, paste, ★ screenshot), shapes, icons, text box, chart, SmartArt-style diagrams, link, bookmark, cross-reference, comment, header, footer, page number, date & time, symbol, equation (★ MathLive), ★ code block, ★ callout, ★ checklist, ★ handwriting from image.

**Draw:** pen, pencil, highlighter (multiple saved pens), eraser (whole stroke or part), lasso select, ruler, ★ ink → text, ★ ink → shape, ★ ink → equation, ink blocks in the text flow **and** free ink over the page, palm rejection, ★ replay ink.

**Design:** document themes (font + colour sets), style sets, watermark, page colour, page borders.

**Layout:** margins (Normal, Narrow, Moderate, Wide, Mirrored, custom), orientation, size (A4 default, A3, A5, Letter, Legal, custom), columns, breaks, line numbers, hyphenation, indent & spacing, arrange/wrap/align objects.

**References:** table of contents (auto-update), footnotes & endnotes, citations & bibliography (APA, MLA, Chicago, Harvard, IEEE), captions, table of figures, cross-references, index.

**Review:** spelling, ★ grammar (LanguageTool), word count (live), ★ readability score, read aloud (Windows voices), translate (optional), comments (threaded, resolve, reply), track changes, accept/reject, compare two documents, ★ protect with password (encrypted `.ped`).

**View:** print layout, web layout, read mode, ★ focus mode, outline view, ruler, gridlines, navigation pane, zoom, one page / multiple pages / page width, split, ★ side-by-side documents, ★ typewriter scrolling.

**★ Extras over Word**
- Alt+Q command search, `/` slash menu, Markdown shortcuts
- Document tabs (many documents in one window)
- Search across your whole library
- Automatic version history with visual diff
- Writing goals (word target, session timer, daily streak)
- Dark/sepia modes that look good
- Optional AI assistant (off by default)

---

## 12. The hard parts and how we solve them

### 12.1 Real pages (Print Layout)
ProseMirror is one continuous flow; Word shows separate pages. Our approach:
1. Keep **one** editor document, so typing, selection and undo across pages all just work.
2. A **pagination plugin** measures each block's height after changes (debounced, and only from the edited block onwards, so it stays fast in long documents).
3. At each page boundary it inserts a **decoration widget**: bottom margin + footer of page N, gap, header + top margin of page N+1.
4. Blocks taller than the remaining space are split at **line level** (paragraphs) or **row level** (tables), respecting widow/orphan control and keep-with-next.
5. Headers, footers and fields (`{PAGE}`, `{NUMPAGES}`) render inside those widgets, with different first page and odd/even support.
6. **Web layout** turns pagination off for speed while writing.

### 12.2 Print & PDF accuracy
Print and PDF use the same paginated render with print CSS, so the preview is exactly what prints. Fonts are embedded in PDFs automatically by Chromium.

### 12.3 Track changes
Our own ProseMirror plugin: while it's on, typing becomes an `insertion` mark and deleting becomes a `deletion` mark (text stays, shown struck through). Each change records author + time. Accept/Reject one or all; the Review panel lists every change. DOCX export writes them as real Word tracked changes.

### 12.4 DOCX compatibility
- Import: text, styles, headings, lists, tables, images, links, footnotes, page size/margins, headers/footers. Complex floating layouts get simplified, and you're told what changed.
- Export: everything we support maps to native Word features, so files open cleanly in Word.
- A folder of sample `.docx` files is used as round-trip tests.

### 12.5 Ink performance
Strokes are drawn live on a `<canvas>` (fast), then saved as vector paths and shown as SVG (sharp at any zoom, prints perfectly). Pointer events use `getCoalescedEvents()` for smooth lines with a fast pen.

---

## 13. Handwriting

### A. Writing in the document (free, offline)
- Works with any Windows Ink pen (Surface Pen, Wacom, laptop styluses), a finger or a mouse.
- Pointer Events provide **pressure, tilt and pen type**; perfect-freehand turns them into natural strokes.
- **Ink blocks** sit inside the text (move with paragraphs). **Page ink** floats over the page for annotating.
- Tools: pen, pencil, highlighter, eraser, lasso, ruler; saved pen presets.
- Palm rejection: while the pen is near the screen, touch is ignored.

### B. Handwriting → typed text

| Engine | Cost | Offline | Quality | How |
|---|---|---|---|---|
| **Windows handwriting panel** | Free | Yes | Very good | Built into Windows: tap the text area with a pen, or open the touch keyboard's handwriting mode. It types straight into Personal Editor; no code needed. |
| **Local model** (TrOCR via transformers.js) | Free | Yes | Good for neat writing, weaker on messy pages | Model downloaded once (~60–300 MB) into `models\`. Runs in the worker so the UI stays smooth. |
| **Optional AI** (Claude vision) | Pay-per-use, small | No | Best: messy pages, tables, diagrams | Only when you switch it on and add an API key. |

### C. Importing handwriting from paper
`Insert → Handwriting from image…` (file, drag-drop or paste a photo from your phone):
1. **Clean up:** auto-crop the page, straighten it, remove shadows, boost contrast (OpenCV.js).
2. **Choose what to make:**
   - **Image:** keep it as a picture.
   - **Ink:** trace it into editable strokes you can erase or recolour.
   - **Text:** recognise it (local model, or AI if enabled).
3. **Review side by side:** photo on the left, recognised text on the right, unsure words highlighted. Fix them, then **Insert**.

---

## 14. Performance targets

| What | Target |
|---|---|
| Cold start to Start screen | < 1.5 s |
| Open a 100-page document | < 1.5 s |
| Keystroke to screen | < 16 ms (one frame), even at 300 pages |
| Re-pagination after an edit | < 50 ms |
| Save (300 pages + images) | < 500 ms, off the UI thread |
| Library search | < 100 ms for 1,000 documents |
| Memory, one typical document | < 300 MB |

---

## 15. Security & reliability

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The UI can only use the `window.pe` API.
- Every IPC call is validated with zod; file paths are checked.
- Strict Content-Security-Policy; no remote code is loaded. The app works with the network unplugged.
- Pasted HTML is sanitised (no scripts from copied web pages).
- Atomic saves, a 2 s recovery buffer, automatic versions: three layers against data loss.
- Optional password protection: AES-256-GCM encryption of the `.ped` contents.

---

## 16. Testing

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | unit conversion, `.ped` read/write + migrations, pagination maths, DOCX mapping, version retention |
| Round-trip | Vitest | sample `.docx` → import → export → compare; `.ped` save → open → identical |
| End-to-end | Playwright (Electron mode) | launch app, type, format, save, reopen, print preview, export PDF, crash recovery |
| Visual | Playwright screenshots | pages, ribbon and dialogs in light/dark, to catch layout breakage |
| Manual | Real Windows PC | pen input, printer, installer, file double-click |

---

## 17. Build, install & update

1. **Develop:** `npm run dev` (hot reload). Works on Windows, Mac or Linux.
2. **Build the installer:** `npm run build:win` →
   - `Personal Editor Setup x.y.z.exe` (installer: choose folder, Start Menu + desktop shortcut)
   - `Personal Editor x.y.z portable.exe` (runs without installing)
   - **Build on Windows** (or a free GitHub Actions Windows runner), because `better-sqlite3` is a native module and building it for Windows is most reliable on Windows.
3. **Install:** run the setup `.exe` → if Windows shows *"Windows protected your PC"*, click **More info → Run anyway** (once).
4. **File association:** `.ped` files get the Personal Editor icon and open on double-click. You can also choose to open `.docx` with it.
5. **Update:** build a new version and run the new installer; it upgrades in place, keeping your documents, settings and history.
6. **Uninstall:** normal Windows *Apps → Uninstall*. Documents are never deleted.

Requirements on the Windows PC for building: **Node.js 22 LTS** and **Git**. Nothing else.

---

## 18. Roadmap

Each phase ends with a version you install and use on Windows. Size: S = a day or two, M = about a week, L = two weeks or more, at a steady pace working with Claude.

### Phase 0: Foundation (S)
- [ ] electron-vite + React + TypeScript + Tailwind scaffold
- [ ] Secure window: preload bridge, CSP, single-instance lock
- [ ] Custom title bar with Mica, light/dark theme
- [ ] electron-builder config: icon, `.ped` association, NSIS + portable
- [ ] GitHub Actions workflow to build the Windows `.exe`
- **Done when:** you install `Personal Editor Setup.exe` on Windows and it opens.

### Phase 1: Core writer (M)
- [ ] TipTap editor with paragraphs, headings, lists, links, undo/redo
- [ ] Command registry + Home tab ribbon + mini toolbar + right-click menu
- [ ] Fonts (all Windows fonts), sizes, colours, highlight, alignment, spacing
- [ ] Styles (Normal, Title, Headings) and the styles gallery
- [ ] `.ped` New / Open / Save / Save As (atomic), document tabs
- [ ] SQLite, recents, Start screen, recovery buffer, AutoSave
- [ ] Find & Replace, word count, status bar, zoom
- **Done when:** you can write, format and save real documents every day.

### Phase 2: Pages & printing (L)
- [ ] Pagination engine with A4 pages, rulers, page gaps
- [ ] Page Setup: size, orientation, margins, columns
- [ ] Headers, footers, page numbers, different first page
- [ ] Page and section breaks
- [ ] Print screen with printer list + live preview + all options
- [ ] Export PDF (with bookmarks)
- **Done when:** a printed page matches the screen.

### Phase 3: Insert (M)
- [ ] Tables (full editing + Table contextual tab)
- [ ] Pictures (insert, paste, resize, crop, wrap) + Picture tab
- [ ] Shapes, text boxes, icons
- [ ] Symbols, equations (MathLive), charts
- [ ] Code blocks, callouts, checklists, slash menu, Markdown shortcuts

### Phase 4: Word compatibility (M)
- [ ] DOCX import (worker) with "what changed" notice
- [ ] DOCX export
- [ ] Markdown / HTML / TXT import and export
- [ ] Round-trip test suite with sample files

### Phase 5: Draw & handwriting (L)
- [ ] Draw tab, pen tools and presets, eraser, lasso
- [ ] Ink blocks and page ink, palm rejection, pressure
- [ ] Ink → shape
- [ ] Handwriting from image: cleanup, keep as image or trace to ink
- [ ] Local TrOCR recognition + side-by-side review
- [ ] Ink → text, ink → equation

### Phase 6: References & review (L)
- [ ] Table of contents, footnotes/endnotes, captions, cross-references
- [ ] Citations & bibliography
- [ ] Spellcheck UI, comments panel, track changes, accept/reject
- [ ] Compare documents
- [ ] Version history panel with visual diff and restore

### Phase 7: Polish & extras (M)
- [ ] Library-wide search, templates, Design tab (themes, watermark, borders)
- [ ] Focus, read, outline and typewriter modes; read aloud
- [ ] Writing goals, password protection
- [ ] Grammar (LanguageTool), optional AI (if you want it)
- [ ] Performance pass against §14 targets, accessibility pass

---

## 19. Risks and how we handle them

| Risk | Plan |
|---|---|
| Pagination is complex and could be slow | Built as an isolated plugin with its own tests; incremental re-measurement; Web layout as a fallback |
| DOCX files from Word don't import perfectly | Accept "good, not perfect"; show what was simplified; keep a round-trip test set |
| Offline handwriting recognition is weak on messy writing | Windows' built-in panel for live pen writing; optional AI for hard pages; always a review step |
| Scope is huge (Word took decades) | Strict phase order; each phase ships a usable app; extras come last |
| Native module (SQLite) build problems on Windows | Build on Windows or GitHub Actions; electron-builder rebuilds it automatically |

---

## 20. Next step

Start **Phase 0**: scaffold the project in this repo and set up the Windows build, so you can install a first `Personal Editor Setup.exe` on your PC before we add features.

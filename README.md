# PDF Form Filler

A lightweight browser-based PDF editor: upload a PDF, add editable text,
draw a signature, drop in images, and export a flattened PDF — all without
leaving your browser.

The architecture prioritizes **coordinate accuracy** between the on-screen
preview and the exported PDF.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS (with dark mode)
- [`pdfjs-dist`](https://github.com/mozilla/pdf.js) for in-browser rendering
- [`pdf-lib`](https://pdf-lib.js.org) for modification and export
- [`react-rnd`](https://github.com/bokuweb/react-rnd) for draggable/resizable overlays
- [`react-signature-canvas`](https://github.com/agilgur5/react-signature-canvas) for handwritten signatures
- [`zustand`](https://zustand-demo.pmnd.rs/) for state
- [`idb`](https://github.com/jakearchibald/idb) for IndexedDB drafts/templates
- [`react-hotkeys-hook`](https://github.com/JohannesKlauss/react-hotkeys-hook) for keyboard shortcuts

## Setup

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

Other scripts:

```bash
npm run build       # production build
npm run start       # serve production build
npm run lint        # next lint
npm run typecheck   # tsc --noEmit
```

## Coordinate System Architecture (read me first)

This app guarantees that **what you see in the preview is what gets exported,
pixel-perfect, regardless of zoom level, page size, rotation, or aspect
ratio.**

### Three coordinate spaces

| Space            | Origin             | Unit        | When used                              |
| ---------------- | ------------------ | ----------- | -------------------------------------- |
| Storage / PDF    | top-left, unrotated| PDF point   | persisted on every overlay (always)    |
| Screen           | top-left of canvas | CSS pixel   | rendering only; derived from zoom      |
| PDF-native       | **bottom-left**    | PDF point   | export only (pdf-lib's convention)     |

### Rules

1. **PDF-space is the source of truth.** Every overlay's `x, y, width, height`
   (and `style.fontSize` for text) is stored in PDF points.
2. **Screen-space is derived per render.** `renderScale = zoom`, so
   `screenValue = pdfValue * renderScale`. Stored values never change when
   you zoom.
3. **Dragging/resizing round-trips immediately.** The moment a drag ends, the
   CSS-pixel result is converted back to PDF points via `screenToPdf` /
   `screenSizeToPdf` and persisted. We never store screen coordinates.
4. **Font sizes match exactly.** On-screen CSS `font-size = fontSize(pt) *
   renderScale`. At export, pdf-lib uses `fontSize` directly (no scale
   applied).
5. **Page rotation never affects storage.** Rotation is a per-page metadata
   flag. The preview applies rotation via CSS transform on the wrapper
   containing both the canvas and the overlay layer, so overlays remain in
   unrotated PDF coordinates — exactly matching pdf-lib's behavior, which
   draws into unrotated page space regardless of `setRotation()`.
6. **Export uses pdf-lib's bottom-left convention.** The single conversion
   is `nativeY = pageHeight − storedY − overlayHeight` (see
   `topLeftToPdfNativeY` in `src/lib/coordinates.ts`).

All conversion functions live in `src/lib/coordinates.ts` with detailed
comments. The export pipeline (`src/lib/export.ts`) is the only other
location that reasons about coordinate spaces directly.

## Project Structure

```
src/
  app/
    layout.tsx                 # Tailwind / global shell
    page.tsx                   # dynamic import of Editor (client-only)
    globals.css
  components/
    Editor.tsx                 # orchestrator
    PDFUploader.tsx            # drag-and-drop upload
    PDFPageCanvas.tsx          # renders one page + overlay layer
    OverlayLayer.tsx           # positions overlays for a page
    overlays/
      TextOverlayView.tsx
      ImageOverlayView.tsx     # also used for signatures
    Toolbar.tsx
    PropertiesPanel.tsx
    PageThumbnailSidebar.tsx
    SignatureModal.tsx
    TemplatesPanel.tsx
  hooks/
    useAutosave.ts             # IndexedDB autosave
  lib/
    coordinates.ts             # ← coordinate conversions (heavily commented)
    export.ts                  # ← pdf-lib export pipeline
    pdfjs.ts                   # lazy worker loader
    fonts.ts                   # CSS ↔ pdf-lib standard font mapping
    storage.ts                 # IndexedDB drafts + templates
  store/
    editorStore.ts             # Zustand: document, overlays, undo/redo
  types/
    overlay.ts                 # Overlay union type
```

## Features

### Phase 1 (MVP) — implemented

- PDF upload (drag-and-drop or browse), multi-page support
- Crisp rendering at devicePixelRatio
- Click-to-add text overlays with inline editing
- Drag, resize, font family/size/color/bold/italic/underline/align/opacity
- Handwritten signature drawing with transparent PNG and auto-trim
- Image upload (PNG/JPEG) with transparency preserved
- Coordinate-accurate export via `pdf-lib`
- Default filename: `<original>_filled.pdf`

### Phase 2 — implemented

- Undo / redo with snapshot history
- Duplicate / delete with keyboard shortcuts
- Zoom in / out / fit-width / fit-page
- Auto-save draft to IndexedDB every 3 seconds
- Manual "Save draft" + draft recovery on next visit
- Copy / paste overlays

### Phase 3 — implemented

- Page thumbnail sidebar
- Reorder pages by drag-drop
- Rotate / delete pages (preview + export reflect changes)
- Layer ordering (bring to front / send to back) and lock

### Phase 4 — implemented

- Save current document as a reusable template
- Open / duplicate / delete templates
- Template versioning field
- IndexedDB persistence (with a clean data shape ready for backend sync)

## Keyboard Shortcuts

| Action       | Mac           | Windows / Linux |
| ------------ | ------------- | --------------- |
| Undo         | ⌘ Z           | Ctrl Z          |
| Redo         | ⌘ ⇧ Z / ⌘ Y   | Ctrl ⇧ Z / Ctrl Y |
| Duplicate    | ⌘ D           | Ctrl D          |
| Copy         | ⌘ C           | Ctrl C          |
| Paste        | ⌘ V           | Ctrl V          |
| Save draft   | ⌘ S           | Ctrl S          |
| Delete item  | Delete / ⌫    | Delete / Backspace |
| Select tool  | V             | V               |
| Text tool    | T             | T               |
| Signature    | S             | S               |

## Notes & Trade-offs

- The export is "flattened" in that overlays are baked into the page
  content stream as drawn text/images. They are not editable form fields
  or annotations. A determined recipient can still copy text or extract
  images — true visual flattening (rasterizing each page) would lose PDF
  text searchability and is not enabled by default.
- Font support is limited to the PDF Standard 14 (Helvetica / Times /
  Courier in regular/bold/italic/bold-italic). To support custom fonts,
  embed a TTF/OTF via `pdf-lib`'s `embedFont` in `src/lib/export.ts` and
  register a matching CSS @font-face in the preview.
- The store/template format is JSON-serializable except for `fileBytes`
  (Uint8Array). A future backend sync layer should store the bytes in
  blob storage and the JSON in a database row.

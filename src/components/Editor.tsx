"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { nanoid } from "nanoid";
import { useEditorStore } from "@/store/editorStore";
import { getPdfJs, type PDFDocumentProxy } from "@/lib/pdfjs";
import { exportFilledPdf } from "@/lib/export";
import { useAutosave } from "@/hooks/useAutosave";
import { loadDraft, saveDraft } from "@/lib/storage";
import PDFUploader from "./PDFUploader";
import PDFPageCanvas from "./PDFPageCanvas";
import Toolbar, { type Tool } from "./Toolbar";
import PropertiesPanel from "./PropertiesPanel";
import PageThumbnailSidebar from "./PageThumbnailSidebar";
import SignatureModal from "./SignatureModal";
import TemplatesPanel from "./TemplatesPanel";
import type { ImageOverlay, SignatureOverlay } from "@/types/overlay";
import { computeFitScale } from "@/lib/coordinates";

/**
 * Editor — top-level orchestrator.
 *
 * Manages:
 *   - PDF.js document instance (loaded once per file)
 *   - Active tool (select/text/signature/image)
 *   - Zoom and viewport fit modes
 *   - Modals (signature, templates)
 *   - Keyboard shortcuts
 *   - Autosave + draft recovery
 */
export default function Editor() {
  const document = useEditorStore((s) => s.document);
  const overlays = useEditorStore((s) => s.overlays);
  const selectedId = useEditorStore((s) => s.selectedId);
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const removeOverlay = useEditorStore((s) => s.removeOverlay);
  const duplicateOverlay = useEditorStore((s) => s.duplicateOverlay);
  const copySelected = useEditorStore((s) => s.copySelected);
  const paste = useEditorStore((s) => s.paste);
  const addOverlay = useEditorStore((s) => s.addOverlay);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const resetDocument = useEditorStore((s) => s.resetDocument);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [showSignature, setShowSignature] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF.js doc whenever the bytes change.
  useEffect(() => {
    let cancelled = false;
    setPdf(null);
    if (!document) return;
    (async () => {
      const pdfjs = await getPdfJs();
      // pdf.js takes ownership of the buffer — pass a copy.
      const doc = await pdfjs.getDocument({ data: document.fileBytes.slice() }).promise;
      if (cancelled) doc.destroy();
      else setPdf(doc);
    })();
    return () => {
      cancelled = true;
    };
  }, [document]);

  // Draft recovery on first mount.
  useEffect(() => {
    (async () => {
      if (document) return;
      const draft = await loadDraft();
      if (draft) setDraftPrompt(true);
    })();
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAutosave();

  // Fit modes — compute zoom so a chosen page fits the viewport.
  const fit = useCallback(
    (mode: "fit-width" | "fit-page") => {
      if (!document || !containerRef.current) return;
      const cw = containerRef.current.clientWidth - 64;
      const ch = containerRef.current.clientHeight - 64;
      const first = document.pages[0];
      const scale = computeFitScale(
        first.pdfWidth,
        first.pdfHeight,
        first.rotation,
        cw,
        ch,
        mode,
      );
      setZoom(scale);
    },
    [document, setZoom],
  );

  // Auto-fit on first load.
  useEffect(() => {
    if (document && pdf) {
      // Delay one frame so container width is correct.
      requestAnimationFrame(() => fit("fit-width"));
    }
  }, [document, pdf, fit]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  useHotkeys("mod+z", (e) => { e.preventDefault(); undo(); }, [undo]);
  useHotkeys("mod+shift+z", (e) => { e.preventDefault(); redo(); }, [redo]);
  useHotkeys("mod+y", (e) => { e.preventDefault(); redo(); }, [redo]);
  useHotkeys(
    "mod+d",
    (e) => {
      if (!selectedId) return;
      e.preventDefault();
      duplicateOverlay(selectedId);
    },
    [selectedId, duplicateOverlay],
  );
  useHotkeys("mod+c", () => copySelected(), [copySelected]);
  useHotkeys("mod+v", () => paste(), [paste]);
  useHotkeys(
    "delete, backspace",
    (e) => {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      // Don't hijack delete inside text inputs/areas (overlay text editor).
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      removeOverlay(selectedId);
    },
    [selectedId, removeOverlay],
  );
  useHotkeys(
    "mod+s",
    async (e) => {
      e.preventDefault();
      await manualSaveDraft();
    },
    [],
  );
  useHotkeys("v", () => setActiveTool("select"));
  useHotkeys("t", () => setActiveTool("text"));
  useHotkeys("s", () => setShowSignature(true));

  async function manualSaveDraft() {
    const s = useEditorStore.getState();
    if (!s.document) return;
    await saveDraft({
      fileName: s.document.fileName,
      fileBytes: s.document.fileBytes,
      pages: s.document.pages,
      overlays: s.overlays,
    });
  }

  // ─── Export ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!document) return;
    const bytes = await exportFilledPdf({
      fileBytes: document.fileBytes,
      pages: document.pages,
      overlays,
    });
    // bytes is a Uint8Array (a subtype of ArrayBufferView, valid for Blob).
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${document.fileName.replace(/\.pdf$/i, "")}_filled.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [document, overlays]);

  // ─── Signature add ──────────────────────────────────────────────────────
  const handleSignatureSaved = useCallback(
    (dataUrl: string, natW: number, natH: number) => {
      if (!document) return;
      const page = document.pages[0];
      // Place the signature in the middle of the first page, at a sensible
      // default width (1/3 page width) preserving aspect ratio.
      const targetWidth = page.pdfWidth / 3;
      const targetHeight = targetWidth * (natH / natW);
      const overlay: SignatureOverlay = {
        id: nanoid(),
        type: "signature",
        pageNumber: 1,
        x: (page.pdfWidth - targetWidth) / 2,
        y: (page.pdfHeight - targetHeight) / 2,
        width: targetWidth,
        height: targetHeight,
        rotation: 0,
        zIndex: 1,
        locked: false,
        dataUrl,
        naturalWidth: natW,
        naturalHeight: natH,
      };
      addOverlay(overlay);
      setActiveTool("select");
    },
    [document, addOverlay],
  );

  // ─── Image upload ───────────────────────────────────────────────────────
  const handleImageFile = useCallback(
    async (file: File) => {
      if (!document) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const page = document.pages[0];
          const targetWidth = Math.min(page.pdfWidth / 3, img.naturalWidth);
          const targetHeight = targetWidth * (img.naturalHeight / img.naturalWidth);
          const overlay: ImageOverlay = {
            id: nanoid(),
            type: "image",
            pageNumber: 1,
            x: (page.pdfWidth - targetWidth) / 2,
            y: (page.pdfHeight - targetHeight) / 2,
            width: targetWidth,
            height: targetHeight,
            rotation: 0,
            zIndex: 1,
            locked: false,
            dataUrl,
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
            style: { opacity: 1 },
          };
          addOverlay(overlay);
          setActiveTool("select");
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    },
    [document, addOverlay],
  );

  // ─── Draft recovery prompt ──────────────────────────────────────────────
  const handleRestoreDraft = async () => {
    const draft = await loadDraft();
    if (!draft) return;
    loadDocument({
      fileName: draft.fileName,
      fileBytes: draft.fileBytes,
      pages: draft.pages,
    });
    useEditorStore.setState({ overlays: draft.overlays });
    setDraftPrompt(false);
  };

  if (!document) {
    return (
      <>
        <PDFUploader />
        {draftPrompt && (
          <div className="fixed bottom-4 right-4 bg-white dark:bg-zinc-900 shadow-lg rounded-lg p-4 border border-zinc-200 dark:border-zinc-800">
            <div className="text-sm mb-2">You have an unsaved draft.</div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDraftPrompt(false)}
                className="px-3 py-1 text-sm rounded border dark:border-zinc-700"
              >
                Dismiss
              </button>
              <button
                onClick={handleRestoreDraft}
                className="px-3 py-1 text-sm rounded bg-blue-600 text-white"
              >
                Restore
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Toolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        onSignatureClick={() => setShowSignature(true)}
        onImageFile={handleImageFile}
        onExport={handleExport}
        onZoomIn={() => setZoom(zoom * 1.25)}
        onZoomOut={() => setZoom(zoom / 1.25)}
        onFitWidth={() => fit("fit-width")}
        onFitPage={() => fit("fit-page")}
        zoom={zoom}
        onUndo={undo}
        onRedo={redo}
        onDuplicate={() => selectedId && duplicateOverlay(selectedId)}
        onDelete={() => selectedId && removeOverlay(selectedId)}
        fileName={document.fileName}
        onSaveDraft={manualSaveDraft}
        onCloseDocument={resetDocument}
        hasSelection={!!selectedId}
      />
      <div className="flex justify-end px-2 py-1 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs">
        <button
          onClick={() => setShowTemplates(true)}
          className="px-2 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Templates…
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        {pdf && <PageThumbnailSidebar pdf={pdf} />}
        <div ref={containerRef} className="flex-1 overflow-auto p-6">
          {pdf ? (
            document.pages.map((p, i) => (
              <PDFPageCanvas
                key={`${p.originalIndex}-${i}`}
                pdf={pdf}
                pageMeta={p}
                pageNumber={i + 1}
                zoom={zoom}
                activeTool={activeTool}
              />
            ))
          ) : (
            <div className="text-zinc-500 text-sm">Rendering pages…</div>
          )}
        </div>
        <PropertiesPanel />
      </div>
      <SignatureModal
        open={showSignature}
        onClose={() => setShowSignature(false)}
        onSave={handleSignatureSaved}
      />
      <TemplatesPanel open={showTemplates} onClose={() => setShowTemplates(false)} />
    </div>
  );
}

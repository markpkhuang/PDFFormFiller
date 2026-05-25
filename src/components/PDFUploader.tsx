"use client";

import { useCallback, useRef, useState } from "react";
import { useEditorStore, type PageMeta } from "@/store/editorStore";
import { getPdfJs } from "@/lib/pdfjs";
import clsx from "clsx";

/**
 * PDFUploader
 * - Accepts drag-and-drop and click-to-browse.
 * - Loads the file bytes, parses page metadata with PDF.js so we know each
 *   page's native size and rotation, and hands the document to the store.
 */
export default function PDFUploader() {
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setLoading(true);
      try {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);

        // Parse pages with PDF.js to record native size/rotation. We pass a
        // copy because pdf.js takes ownership of the buffer.
        const pdfjs = await getPdfJs();
        const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        const pages: PageMeta[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          // viewport at scale 1 returns dimensions in PDF points.
          const vp = page.getViewport({ scale: 1, rotation: 0 });
          pages.push({
            originalIndex: i - 1,
            pdfWidth: vp.width,
            pdfHeight: vp.height,
            // We start with rotation 0 — user rotation is layered on top.
            rotation: 0,
          });
        }
        await doc.destroy();

        loadDocument({ fileName: file.name, fileBytes: bytes, pages });
      } catch (e) {
        console.error(e);
        setError("Could not read that PDF. Is the file valid?");
      } finally {
        setLoading(false);
      }
    },
    [loadDocument],
  );

  return (
    <div className="h-full w-full flex items-center justify-center p-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file && file.type === "application/pdf") handleFile(file);
          else setError("Please drop a PDF file.");
        }}
        className={clsx(
          "max-w-xl w-full rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition",
          dragOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
            : "border-zinc-300 dark:border-zinc-700 hover:border-blue-400 dark:hover:border-blue-500",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="text-3xl font-semibold mb-2">PDF Form Filler</div>
        <div className="text-zinc-500 dark:text-zinc-400 mb-6">
          Drop a PDF here or click to browse.
        </div>
        <div className="text-xs text-zinc-400">
          Everything happens in your browser. Your file never leaves your device.
        </div>
        {loading && (
          <div className="mt-4 text-blue-600 dark:text-blue-400">Loading…</div>
        )}
        {error && <div className="mt-4 text-red-600">{error}</div>}
      </label>
    </div>
  );
}

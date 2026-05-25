"use client";

import { useEffect, useRef, useState } from "react";
import { getPdfJs, type PDFDocumentProxy } from "@/lib/pdfjs";
import { useEditorStore } from "@/store/editorStore";

interface Props {
  pdf: PDFDocumentProxy;
}

/**
 * PageThumbnailSidebar
 *
 * Shows small thumbnails for each page in current logical order. Supports
 * rotation, deletion, and simple drag-to-reorder.
 */
export default function PageThumbnailSidebar({ pdf }: Props) {
  const pages = useEditorStore((s) => s.document?.pages ?? []);
  const reorderPages = useEditorStore((s) => s.reorderPages);
  const rotatePage = useEditorStore((s) => s.rotatePage);
  const deletePage = useEditorStore((s) => s.deletePage);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  return (
    <div className="w-40 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-2 space-y-2">
      {pages.map((p, i) => (
        <div
          key={`${p.originalIndex}-${i}`}
          draggable
          onDragStart={() => setDraggingIndex(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggingIndex !== null && draggingIndex !== i) {
              reorderPages(draggingIndex, i);
            }
            setDraggingIndex(null);
          }}
          className="rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1"
        >
          <Thumbnail
            pdf={pdf}
            originalIndex={p.originalIndex}
            rotation={p.rotation}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-zinc-500">#{i + 1}</span>
            <div className="flex gap-1">
              <button
                onClick={() => rotatePage(i, -90)}
                className="text-xs px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                title="Rotate left"
              >
                ↺
              </button>
              <button
                onClick={() => rotatePage(i, 90)}
                className="text-xs px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                title="Rotate right"
              >
                ↻
              </button>
              <button
                onClick={() => deletePage(i)}
                className="text-xs px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-red-600"
                title="Delete page"
              >
                🗑
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Thumbnail({
  pdf,
  originalIndex,
  rotation,
}: {
  pdf: PDFDocumentProxy;
  originalIndex: number;
  rotation: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = canvasRef.current;
      if (!c) return;
      await getPdfJs();
      const page = await pdf.getPage(originalIndex + 1);
      const baseViewport = page.getViewport({ scale: 1, rotation: 0 });
      const scale = 140 / baseViewport.width;
      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
      if (cancelled) return;
      c.width = viewport.width;
      c.height = viewport.height;
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport } as never).promise;
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, originalIndex, rotation]);

  return (
    <div className="flex justify-center bg-zinc-100 dark:bg-zinc-800 rounded">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}

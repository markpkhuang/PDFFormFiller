"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPdfJs, type PDFDocumentProxy } from "@/lib/pdfjs";
import type { PageMeta } from "@/store/editorStore";
import { useEditorStore } from "@/store/editorStore";
import {
  type PageRenderInfo,
  rotatedRenderedSize,
  screenToPdf,
} from "@/lib/coordinates";
import OverlayLayer from "./OverlayLayer";
import type { TextOverlay } from "@/types/overlay";
import { nanoid } from "nanoid";
import { DEFAULT_FONT } from "@/lib/fonts";

interface Props {
  pdf: PDFDocumentProxy;
  pageMeta: PageMeta;
  pageNumber: number; // 1-indexed display index
  zoom: number;
  activeTool: "select" | "text" | "signature" | "image";
}

/**
 * PDFPageCanvas
 *
 * Renders ONE page as a bitmap and overlays an absolutely-positioned
 * <OverlayLayer> on top. The two must be aligned EXACTLY in screen-space;
 * we enforce this by sharing one `PageRenderInfo`.
 *
 * Rotation handling
 * ─────────────────
 * The PDF is rendered UNROTATED to canvas. User rotation is then applied
 * via a CSS transform on the inner wrapper (containing both canvas and
 * overlay layer). This means:
 *   - Overlay storage stays in unrotated PDF coordinates (the source of
 *     truth).
 *   - Overlays visually rotate WITH the page, which matches export
 *     behavior: pdf-lib draws into unrotated page coordinates regardless of
 *     setRotation(), so what the user sees IS what they get.
 */
export default function PDFPageCanvas({
  pdf,
  pageMeta,
  pageNumber,
  zoom,
  activeTool,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayHostRef = useRef<HTMLDivElement>(null);

  const addOverlay = useEditorStore((s) => s.addOverlay);
  const setSelected = useEditorStore((s) => s.setSelected);

  // The one true mapping: 1 CSS pixel == 1 PDF point × zoom.
  // Everything else derives from this.
  const info: PageRenderInfo = useMemo(
    () => ({
      pageNumber,
      pdfWidth: pageMeta.pdfWidth,
      pdfHeight: pageMeta.pdfHeight,
      rotation: pageMeta.rotation,
      renderedWidth: pageMeta.pdfWidth * zoom,
      renderedHeight: pageMeta.pdfHeight * zoom,
      renderScale: zoom,
    }),
    [pageNumber, pageMeta, zoom],
  );

  // Render PDF bitmap to canvas at devicePixelRatio for sharpness.
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      const page = await pdf.getPage(pageMeta.originalIndex + 1);
      const dpr = window.devicePixelRatio || 1;
      // Always render the bitmap UNROTATED (rotation: 0). The page's
      // effective rotation — which already includes the PDF's intrinsic
      // /Rotate, captured at upload time — is applied as a CSS transform
      // on the wrapping <div> below. This keeps overlay storage in
      // unrotated PDF coordinates and makes the bitmap size match
      // info.renderedWidth/Height exactly.
      const viewport = page.getViewport({ scale: zoom * dpr, rotation: 0 });
      if (cancelled) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${info.renderedWidth}px`;
      canvas.style.height = `${info.renderedHeight}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({ canvasContext: ctx, viewport } as never).promise;
    })();

    return () => {
      cancelled = true;
    };
  }, [pdf, pageMeta.originalIndex, zoom, info.renderedWidth, info.renderedHeight]);

  // Convert a click on the overlay host into PDF coordinates and add a
  // new text overlay there. The host's bounding rect is in screen-space
  // AFTER the CSS rotation is applied — but we computed renderScale from
  // unrotated dimensions, and we want unrotated PDF coords. So we read
  // the click's position from the host element's UNTRANSFORMED rect by
  // mapping through the inverse of its transform. Easier: read the
  // unrotated wrapper's rect (we tag it with data-unrotated).
  const handlePlaceText = (e: React.MouseEvent) => {
    const host = overlayHostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    // When rotated, the bounding rect of the host is in screen-space and
    // axis-aligned to the viewport, not to the unrotated page. We need to
    // invert the rotation to get the unrotated local point. Because the
    // wrapper rotates around top-left of the unrotated content (we set
    // transform-origin: 0 0), the inverse is straightforward.
    const local = unrotateScreenPoint(
      { x: e.clientX, y: e.clientY },
      host,
      pageMeta.rotation,
      info,
    );
    const pdfPt = screenToPdf(local, info);
    // Clamp to page bounds.
    if (
      pdfPt.x < 0 ||
      pdfPt.y < 0 ||
      pdfPt.x > pageMeta.pdfWidth ||
      pdfPt.y > pageMeta.pdfHeight
    )
      return;

    const newOverlay: TextOverlay = {
      id: nanoid(),
      type: "text",
      pageNumber,
      x: pdfPt.x,
      y: pdfPt.y,
      width: 180,
      height: 28,
      rotation: 0,
      zIndex: 1,
      locked: false,
      text: "Text",
      style: {
        fontFamily: DEFAULT_FONT,
        fontSize: 14,
        color: "#111111",
        bold: false,
        italic: false,
        underline: false,
        align: "left",
        opacity: 1,
      },
    };
    addOverlay(newOverlay);
    // suppress unused
    void rect;
  };

  const rotatedSize = rotatedRenderedSize(info);

  // CSS transform for visual rotation. transform-origin is top-left of the
  // unrotated content; we translate to put the rotated content back inside
  // the outer (rotated-size) wrapper.
  const innerTransform = useMemo(() => {
    switch (pageMeta.rotation) {
      case 0:
        return "none";
      case 90:
        return `translate(${info.renderedHeight}px, 0) rotate(90deg)`;
      case 180:
        return `translate(${info.renderedWidth}px, ${info.renderedHeight}px) rotate(180deg)`;
      case 270:
        return `translate(0, ${info.renderedWidth}px) rotate(270deg)`;
    }
  }, [pageMeta.rotation, info.renderedWidth, info.renderedHeight]);

  return (
    <div
      className="relative bg-white shadow-md mx-auto my-4 rounded"
      style={{ width: rotatedSize.width, height: rotatedSize.height }}
      data-page-number={pageNumber}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      <div
        style={{
          width: info.renderedWidth,
          height: info.renderedHeight,
          transform: innerTransform,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", position: "absolute", top: 0, left: 0 }}
        />
        <div
          ref={overlayHostRef}
          className="absolute inset-0"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
          onClick={(e) => {
            if (activeTool === "text" && e.target === e.currentTarget) {
              handlePlaceText(e);
            }
          }}
          style={{
            cursor: activeTool === "text" ? "text" : "default",
          }}
        >
          <OverlayLayer pageNumber={pageNumber} info={info} />
        </div>
      </div>
    </div>
  );
}

/**
 * Convert a viewport-relative screen point into the unrotated local
 * coordinate system of `host`. The host has been rotated via CSS transform
 * with transform-origin = top-left, so we use its top-left corner in the
 * viewport as the rotation pivot.
 */
function unrotateScreenPoint(
  pt: { x: number; y: number },
  host: HTMLElement,
  rotation: 0 | 90 | 180 | 270,
  info: PageRenderInfo,
): { x: number; y: number } {
  if (rotation === 0) {
    const r = host.getBoundingClientRect();
    return { x: pt.x - r.left, y: pt.y - r.top };
  }
  // Find the rotation pivot in viewport coords: the top-left of the
  // unrotated content is also the top-left of the outer page wrapper.
  const outer = host.closest("[data-page-number]") as HTMLElement | null;
  const pivot = outer
    ? outer.getBoundingClientRect()
    : host.getBoundingClientRect();
  let lx = pt.x - pivot.left;
  let ly = pt.y - pivot.top;
  // Inverse rotation:
  switch (rotation) {
    case 90:
      return { x: ly, y: info.renderedHeight - lx };
    case 180:
      return { x: info.renderedWidth - lx, y: info.renderedHeight - ly };
    case 270:
      return { x: info.renderedWidth - ly, y: lx };
  }
}

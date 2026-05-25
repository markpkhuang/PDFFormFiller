"use client";

/**
 * PDF export pipeline.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CORRECTNESS NOTE — coordinate conversion
 * ──────────────────────────────────────────────────────────────────────────
 * Overlays are stored in PDF points with TOP-LEFT origin (see
 * lib/coordinates.ts). pdf-lib expects BOTTOM-LEFT origin in PDF points.
 *
 * For each overlay on an UNROTATED page we convert with:
 *   nativeX = storedX
 *   nativeY = pageHeight - storedY - overlayHeight
 *
 * For pages the user rotated in the editor we call `page.setRotation()`.
 * pdf-lib draws using the UNROTATED page coordinate system regardless of
 * rotation, so the same conversion holds — the viewer applies the rotation
 * when displaying the result.
 *
 * Font sizes use the stored PDF-point value directly: no scale factor.
 * Zoom level has no effect on export — it never reads `zoom` from the store.
 */

import {
  PDFDocument,
  rgb,
  degrees,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";

import type { Overlay, TextOverlay } from "@/types/overlay";
import type { PageMeta } from "@/store/editorStore";
import { getStandardFontForStyle } from "./fonts";
import { topLeftToPdfNativeY } from "./coordinates";

interface ExportArgs {
  fileBytes: Uint8Array;
  pages: PageMeta[];
  overlays: Overlay[];
}

/**
 * Convert a CSS hex color (#rrggbb) to pdf-lib's normalized RGB.
 */
function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const v = m.length === 3
    ? m.split("").map((c) => c + c).join("")
    : m.padEnd(6, "0");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/**
 * Convert a data URL → ArrayBuffer for pdf-lib embedding.
 */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function dataUrlMime(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  return m ? m[1] : "image/png";
}

async function embedImageForUrl(pdf: PDFDocument, dataUrl: string): Promise<PDFImage> {
  const bytes = dataUrlToBytes(dataUrl);
  const mime = dataUrlMime(dataUrl);
  if (mime === "image/jpeg" || mime === "image/jpg") return pdf.embedJpg(bytes);
  return pdf.embedPng(bytes);
}

async function getFont(
  pdf: PDFDocument,
  cache: Map<StandardFonts, PDFFont>,
  font: StandardFonts,
): Promise<PDFFont> {
  let cached = cache.get(font);
  if (cached) return cached;
  cached = await pdf.embedFont(font);
  cache.set(font, cached);
  return cached;
}

/**
 * Draw a single text overlay into a page.
 *
 * Multi-line behavior: split on \n, draw lines top-to-bottom using the
 * font's ascent as the baseline anchor. We use the font's natural line
 * height (fontSize * 1.2) to preserve visual parity with the on-screen
 * CSS rendering (which uses Tailwind's default line-height).
 */
function drawTextOverlay(
  page: PDFPage,
  overlay: TextOverlay,
  font: PDFFont,
  pageHeightPt: number,
) {
  const { x, y, width, height, style } = overlay;
  const lines = overlay.text.split("\n");

  // Use the same line-height ratio as the on-screen renderer (1.2).
  const lineHeight = style.fontSize * 1.2;

  // Compute starting baseline for the first line, anchored to the top of
  // the overlay box. PDF text Y refers to the baseline, so add font ascent.
  const ascent = font.heightAtSize(style.fontSize, { descender: false });
  const topY = topLeftToPdfNativeY(y, height, pageHeightPt);
  // Move baseline down from the top of the box by the ascent of line 1.
  let baselineY = topY + height - ascent;

  const color = hexToRgb(style.color);

  for (const line of lines) {
    if (line.length === 0) {
      baselineY -= lineHeight;
      continue;
    }
    const textWidth = font.widthOfTextAtSize(line, style.fontSize);
    let drawX = x;
    if (style.align === "center") drawX = x + (width - textWidth) / 2;
    else if (style.align === "right") drawX = x + (width - textWidth);

    page.drawText(line, {
      x: drawX,
      y: baselineY,
      size: style.fontSize,
      font,
      color,
      opacity: style.opacity,
    });

    if (style.underline) {
      // Underline: 1pt thick, ~10% of fontSize below baseline.
      const underlineY = baselineY - style.fontSize * 0.1;
      page.drawLine({
        start: { x: drawX, y: underlineY },
        end: { x: drawX + textWidth, y: underlineY },
        thickness: Math.max(0.5, style.fontSize * 0.05),
        color,
        opacity: style.opacity,
      });
    }

    baselineY -= lineHeight;
  }
}

/**
 * Build the exported PDF.
 *
 * Steps:
 *   1. Load original bytes with pdf-lib.
 *   2. Reorder/delete pages according to `pages`.
 *   3. Apply page rotation.
 *   4. For each overlay, convert top-left → bottom-left and draw.
 *   5. Save and return bytes.
 *
 * The output is "flattened" in the sense that all overlays are baked into
 * the page content stream as ordinary PDF objects — they are not editable
 * form fields or annotations. Recipients can still in theory copy text or
 * extract images, but they cannot drag the overlays around in a viewer.
 */
export async function exportFilledPdf({
  fileBytes,
  pages,
  overlays,
}: ExportArgs): Promise<Uint8Array> {
  // pdf-lib mutates the bytes — pass a copy so we can re-export later.
  const src = await PDFDocument.load(fileBytes.slice());

  // Build a brand-new doc and copy pages in the user's chosen order. This
  // gives us deterministic control over page order vs. mutating src in place.
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p.originalIndex),
  );

  const fontCache = new Map<StandardFonts, PDFFont>();
  // Cache image embeds by dataUrl identity so duplicates don't bloat the PDF.
  const imageCache = new Map<string, PDFImage>();

  for (let i = 0; i < copied.length; i++) {
    const page = copied[i];
    const meta = pages[i];

    // Apply the user's chosen rotation. We use absolute rotation, not delta.
    page.setRotation(degrees(meta.rotation));
    out.addPage(page);

    // Native (unrotated) page dimensions in points. These are what pdf-lib
    // uses for the coordinate system — independent of setRotation().
    const pageWidthPt = page.getWidth();
    const pageHeightPt = page.getHeight();

    const pageOverlays = overlays
      .filter((o) => o.pageNumber === i + 1)
      .sort((a, b) => a.zIndex - b.zIndex);

    for (const o of pageOverlays) {
      if (o.type === "text") {
        const std = getStandardFontForStyle(
          o.style.fontFamily,
          o.style.bold,
          o.style.italic,
        );
        const font = await getFont(out, fontCache, std);
        drawTextOverlay(page, o, font, pageHeightPt);
        // Silence unused warnings for variables we may use in future
        // (page width currently not used since we use stored width).
        void pageWidthPt;
      } else {
        let img = imageCache.get(o.dataUrl);
        if (!img) {
          img = await embedImageForUrl(out, o.dataUrl);
          imageCache.set(o.dataUrl, img);
        }
        const nativeY = topLeftToPdfNativeY(o.y, o.height, pageHeightPt);
        const opacity = o.type === "image" ? o.style.opacity : 1;
        page.drawImage(img, {
          x: o.x,
          y: nativeY,
          width: o.width,
          height: o.height,
          rotate: o.rotation ? degrees(-o.rotation) : undefined,
          opacity,
        });
      }
    }
  }

  return out.save();
}

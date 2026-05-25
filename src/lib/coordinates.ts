/**
 * Coordinate system for PDF Form Filler.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CORE PRINCIPLE
 * ──────────────────────────────────────────────────────────────────────────
 * PDF-space is the source of truth. Screen-space is derived on every render
 * from `renderScale` (the zoom factor). All overlay positions, sizes, and
 * font sizes are stored in PDF points (1pt = 1/72 inch).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * SPACES
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   STORAGE / PDF-SPACE (what we persist on every overlay)
 *     - Origin: top-left of the UNROTATED page
 *     - Units:  PDF points
 *     - Y axis: grows DOWN (matches DOM convention; easier to reason about)
 *
 *   SCREEN-SPACE (what the browser renders)
 *     - Origin: top-left of the canvas element
 *     - Units:  CSS pixels
 *     - Derived: screenValue = pdfValue * renderScale
 *
 *   PDF-NATIVE-SPACE (what pdf-lib expects at export time)
 *     - Origin: BOTTOM-LEFT of the page
 *     - Units:  PDF points
 *     - Y axis: grows UP
 *     - Conversion from our top-left storage:
 *         nativeY = pageHeight - storedY - overlayHeight
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS WORKS
 * ──────────────────────────────────────────────────────────────────────────
 * - Zoom only changes `renderScale`. Stored coordinates never change, so the
 *   exported PDF is independent of the user's current zoom level.
 * - Different page sizes/aspect ratios are handled uniformly: every page
 *   computes its own `renderScale = renderedCssWidth / pageWidthPt`.
 * - Page rotation is stored as page metadata and applied at export by
 *   pdf-lib; overlays are stored in unrotated page coordinates so they
 *   always reference the same logical position.
 * - Font sizes are PDF points; on screen we multiply by `renderScale` so
 *   visual size matches export exactly.
 */

/** A point or size measured in PDF points (origin: top-left of unrotated page). */
export interface PdfPoint {
  x: number;
  y: number;
}

export interface PdfSize {
  width: number;
  height: number;
}

/** A point or size measured in CSS pixels relative to the rendered canvas. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

/**
 * Per-page rendering metadata. One of these exists for every page after the
 * PDF is laid out, recomputed whenever the user zooms or the container
 * resizes.
 */
export interface PageRenderInfo {
  pageNumber: number; // 1-indexed
  /** Native page width in PDF points (unrotated). */
  pdfWidth: number;
  /** Native page height in PDF points (unrotated). */
  pdfHeight: number;
  /** Page rotation in degrees: 0, 90, 180, or 270. */
  rotation: 0 | 90 | 180 | 270;
  /** Current rendered width of the canvas in CSS pixels. */
  renderedWidth: number;
  /** Current rendered height of the canvas in CSS pixels. */
  renderedHeight: number;
  /**
   * Conversion factor: pdfPoints → cssPixels.
   * Always equals renderedWidth / pdfWidth (after accounting for rotation).
   */
  renderScale: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversions: PDF-space ⇄ Screen-space
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PDF-space → screen-space.
 * Used when positioning an overlay's DOM element inside the page canvas.
 */
export function pdfToScreen(
  pt: PdfPoint,
  info: Pick<PageRenderInfo, "renderScale">,
): ScreenPoint {
  return { x: pt.x * info.renderScale, y: pt.y * info.renderScale };
}

export function pdfSizeToScreen(
  size: PdfSize,
  info: Pick<PageRenderInfo, "renderScale">,
): ScreenSize {
  return {
    width: size.width * info.renderScale,
    height: size.height * info.renderScale,
  };
}

/**
 * Screen-space → PDF-space.
 * Used when a user finishes dragging/resizing and we need to persist the
 * overlay's new position. NEVER use screen coordinates as the source of
 * truth — always round-trip through this conversion immediately.
 */
export function screenToPdf(
  pt: ScreenPoint,
  info: Pick<PageRenderInfo, "renderScale">,
): PdfPoint {
  return { x: pt.x / info.renderScale, y: pt.y / info.renderScale };
}

export function screenSizeToPdf(
  size: ScreenSize,
  info: Pick<PageRenderInfo, "renderScale">,
): PdfSize {
  return {
    width: size.width / info.renderScale,
    height: size.height / info.renderScale,
  };
}

/**
 * PDF font size (points) → CSS pixels for on-screen rendering.
 * Multiplying by renderScale guarantees that the on-screen text occupies
 * the same physical area as the exported PDF text.
 */
export function pdfFontSizeToScreen(
  fontSizePt: number,
  info: Pick<PageRenderInfo, "renderScale">,
): number {
  return fontSizePt * info.renderScale;
}

// ─────────────────────────────────────────────────────────────────────────────
// Export-time conversion: stored top-left → pdf-lib bottom-left
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert our stored top-left PDF coordinates to pdf-lib's bottom-left
 * coordinates for a given UNROTATED page height.
 *
 * Rotation is applied separately by pdf-lib via page.setRotation(). When
 * drawing on a rotated page, pdf-lib still uses the unrotated coordinate
 * system, so this conversion stays the same regardless of rotation.
 *
 * @param storedY     overlay top edge, measured from the top of the page
 * @param overlayHeight overlay height in PDF points
 * @param pageHeight  the page's unrotated height in PDF points
 */
export function topLeftToPdfNativeY(
  storedY: number,
  overlayHeight: number,
  pageHeight: number,
): number {
  return pageHeight - storedY - overlayHeight;
}

/**
 * Compute renderScale that fits a page into a container, preserving aspect
 * ratio and respecting any rotation that swaps width/height.
 */
export function computeFitScale(
  pdfWidth: number,
  pdfHeight: number,
  rotation: 0 | 90 | 180 | 270,
  containerWidth: number,
  containerHeight: number,
  mode: "fit-width" | "fit-page",
): number {
  const rotated = rotation === 90 || rotation === 270;
  const w = rotated ? pdfHeight : pdfWidth;
  const h = rotated ? pdfWidth : pdfHeight;
  if (mode === "fit-width") return containerWidth / w;
  return Math.min(containerWidth / w, containerHeight / h);
}

/**
 * Apply rotation to displayed width/height.
 * (Useful for sizing the wrapping page element.)
 */
export function rotatedRenderedSize(info: PageRenderInfo): ScreenSize {
  const swap = info.rotation === 90 || info.rotation === 270;
  return {
    width: swap ? info.renderedHeight : info.renderedWidth,
    height: swap ? info.renderedWidth : info.renderedHeight,
  };
}

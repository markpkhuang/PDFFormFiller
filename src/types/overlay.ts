/**
 * Overlay data model.
 *
 * All positional/size fields are PDF-space (PDF points, top-left origin of
 * the unrotated page). Screen coordinates are derived per render from the
 * page's renderScale — never stored.
 */

export type OverlayType = "text" | "signature" | "image";

export type TextAlign = "left" | "center" | "right";

export interface TextStyle {
  fontFamily: string;
  /** Font size in PDF points. */
  fontSize: number;
  color: string; // CSS hex, e.g. "#000000"
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextAlign;
  /** 0..1 */
  opacity: number;
}

export interface ImageStyle {
  /** 0..1 */
  opacity: number;
}

/** Base shared across all overlay types. */
interface OverlayBase {
  id: string;
  pageNumber: number; // 1-indexed
  /** Position in PDF points (top-left origin, unrotated page). */
  x: number;
  y: number;
  /** Size in PDF points. */
  width: number;
  height: number;
  /** Degrees, clockwise. */
  rotation: number;
  zIndex: number;
  locked: boolean;
  metadata?: Record<string, unknown>;
}

export interface TextOverlay extends OverlayBase {
  type: "text";
  text: string;
  style: TextStyle;
}

export interface SignatureOverlay extends OverlayBase {
  type: "signature";
  /** Transparent PNG data URL of the signature. */
  dataUrl: string;
  /** Native intrinsic pixel size of the rendered signature image. */
  naturalWidth: number;
  naturalHeight: number;
}

export interface ImageOverlay extends OverlayBase {
  type: "image";
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  style: ImageStyle;
}

export type Overlay = TextOverlay | SignatureOverlay | ImageOverlay;

/**
 * A partial update to an overlay. Distributes over the union so that
 * type-specific fields (e.g. `text` on TextOverlay) survive.
 */
type DistributePatch<T> = T extends Overlay
  ? Partial<Omit<T, "id" | "type">> & { id: string }
  : never;
export type OverlayPatch = DistributePatch<Overlay>;

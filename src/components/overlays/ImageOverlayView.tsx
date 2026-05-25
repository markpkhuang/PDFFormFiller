"use client";

import { Rnd } from "react-rnd";
import type { ImageOverlay, SignatureOverlay } from "@/types/overlay";
import {
  type PageRenderInfo,
  screenSizeToPdf,
  screenToPdf,
} from "@/lib/coordinates";
import { useEditorStore } from "@/store/editorStore";
import clsx from "clsx";

interface Props {
  overlay: ImageOverlay | SignatureOverlay;
  info: PageRenderInfo;
}

/**
 * ImageOverlayView (also used for signature overlays)
 *
 * Same coordinate-conversion model as TextOverlayView. The on-screen
 * <img> is sized in CSS pixels = PDF size × renderScale, guaranteeing
 * preview/export parity at any zoom.
 */
export default function ImageOverlayView({ overlay, info }: Props) {
  const selectedId = useEditorStore((s) => s.selectedId);
  const setSelected = useEditorStore((s) => s.setSelected);
  const updateLive = useEditorStore((s) => s.updateOverlayLive);
  const commit = useEditorStore((s) => s.commit);
  const isSelected = selectedId === overlay.id;

  const screenX = overlay.x * info.renderScale;
  const screenY = overlay.y * info.renderScale;
  const screenW = overlay.width * info.renderScale;
  const screenH = overlay.height * info.renderScale;

  // Preserve aspect ratio when resizing images/signatures.
  const aspectRatio = overlay.naturalWidth / overlay.naturalHeight || 1;
  const opacity = overlay.type === "image" ? overlay.style.opacity : 1;

  return (
    <Rnd
      size={{ width: screenW, height: screenH }}
      position={{ x: screenX, y: screenY }}
      disableDragging={overlay.locked}
      enableResizing={!overlay.locked}
      lockAspectRatio={aspectRatio}
      bounds="parent"
      resizeHandleClasses={{
        topLeft: "rnd-handle",
        topRight: "rnd-handle",
        bottomLeft: "rnd-handle",
        bottomRight: "rnd-handle",
      }}
      enableUserSelectHack={false}
      onDragStart={() => setSelected(overlay.id)}
      onDrag={(_e, d) => {
        const pdf = screenToPdf({ x: d.x, y: d.y }, info);
        updateLive({ id: overlay.id, x: pdf.x, y: pdf.y });
      }}
      onDragStop={() => commit()}
      onResizeStart={() => setSelected(overlay.id)}
      onResize={(_e, _dir, ref, _delta, pos) => {
        const sz = {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        };
        const pdfSize = screenSizeToPdf(sz, info);
        const pdfPos = screenToPdf({ x: pos.x, y: pos.y }, info);
        updateLive({
          id: overlay.id,
          x: pdfPos.x,
          y: pdfPos.y,
          width: pdfSize.width,
          height: pdfSize.height,
        });
      }}
      onResizeStop={() => commit()}
      style={{ zIndex: overlay.zIndex + 10 }}
      onMouseDown={(e) => {
        e.stopPropagation();
        setSelected(overlay.id);
      }}
      className={clsx(
        isSelected
          ? "ring-2 ring-blue-500"
          : "ring-1 ring-transparent hover:ring-blue-300",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={overlay.dataUrl}
        alt=""
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "fill",
          opacity,
          pointerEvents: "none",
          userSelect: "none",
        }}
      />
    </Rnd>
  );
}

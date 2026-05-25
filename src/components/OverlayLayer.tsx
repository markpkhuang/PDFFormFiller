"use client";

import { useEditorStore } from "@/store/editorStore";
import type { PageRenderInfo } from "@/lib/coordinates";
import TextOverlayView from "./overlays/TextOverlayView";
import ImageOverlayView from "./overlays/ImageOverlayView";

interface Props {
  pageNumber: number;
  info: PageRenderInfo;
}

/**
 * OverlayLayer
 *
 * Renders all overlays that live on `pageNumber`. Each overlay is
 * positioned in PDF coordinates; the per-overlay component multiplies by
 * `info.renderScale` to compute its CSS box. We do NOT pass screen
 * coordinates here — only the rendering info — so the layer trivially
 * tracks zoom changes.
 */
export default function OverlayLayer({ pageNumber, info }: Props) {
  const overlays = useEditorStore((s) =>
    s.overlays.filter((o) => o.pageNumber === pageNumber),
  );

  // Sort by zIndex so taller-z overlays render on top.
  const sorted = [...overlays].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      {sorted.map((o) => {
        if (o.type === "text") return <TextOverlayView key={o.id} overlay={o} info={info} />;
        return <ImageOverlayView key={o.id} overlay={o} info={info} />;
      })}
    </>
  );
}

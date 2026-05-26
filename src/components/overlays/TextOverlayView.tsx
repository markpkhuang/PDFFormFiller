"use client";

import { Rnd } from "react-rnd";
import { useEffect, useRef, useState } from "react";
import type { TextOverlay } from "@/types/overlay";
import {
  type PageRenderInfo,
  pdfFontSizeToScreen,
  screenSizeToPdf,
  screenToPdf,
} from "@/lib/coordinates";
import { useEditorStore } from "@/store/editorStore";
import { FONT_REGISTRY } from "@/lib/fonts";
import clsx from "clsx";

interface Props {
  overlay: TextOverlay;
  info: PageRenderInfo;
}

/**
 * TextOverlayView
 *
 * On-screen size & position are PURELY derived from `overlay.{x,y,w,h}` in
 * PDF points and `info.renderScale`. When the user drags or resizes, we
 * convert the resulting CSS-pixel values back to PDF points BEFORE storing.
 *
 * Font sizing matches export: CSS px = fontSize(pt) × renderScale.
 *
 * Critically, this means: changing zoom only changes `info.renderScale`,
 * causing the overlay to scale visually but its stored PDF coordinates
 * remain identical — guaranteeing pixel-perfect export.
 */
export default function TextOverlayView({ overlay, info }: Props) {
  const selectedId = useEditorStore((s) => s.selectedId);
  const setSelected = useEditorStore((s) => s.setSelected);
  const updateLive = useEditorStore((s) => s.updateOverlayLive);
  const commit = useEditorStore((s) => s.commit);
  const update = useEditorStore((s) => s.updateOverlay);

  const isSelected = selectedId === overlay.id;
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Derive screen-space box from PDF coordinates.
  const screenX = overlay.x * info.renderScale;
  const screenY = overlay.y * info.renderScale;
  const screenW = overlay.width * info.renderScale;
  const screenH = overlay.height * info.renderScale;

  const fontDef = FONT_REGISTRY[overlay.style.fontFamily] ?? FONT_REGISTRY.Helvetica;
  const fontPx = pdfFontSizeToScreen(overlay.style.fontSize, info);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  return (
    <Rnd
      size={{ width: screenW, height: screenH }}
      position={{ x: screenX, y: screenY }}
      disableDragging={overlay.locked || editing}
      enableResizing={!overlay.locked && !editing}
      bounds="parent"
      resizeHandleClasses={{
        topLeft: "rnd-handle",
        topRight: "rnd-handle",
        bottomLeft: "rnd-handle",
        bottomRight: "rnd-handle",
        top: "rnd-handle",
        right: "rnd-handle",
        bottom: "rnd-handle",
        left: "rnd-handle",
      }}
      onDragStart={() => setSelected(overlay.id)}
      onDrag={(_e, d) => {
        // d.x/d.y are in CSS pixels relative to parent — convert back to PDF pts.
        const pdf = screenToPdf({ x: d.x, y: d.y }, info);
        updateLive({ id: overlay.id, x: pdf.x, y: pdf.y });
      }}
      onDragStop={() => commit()}
      onResizeStart={() => setSelected(overlay.id)}
      onResize={(_e, _dir, ref, _delta, pos) => {
        const screenSize = {
          width: parseFloat(ref.style.width),
          height: parseFloat(ref.style.height),
        };
        const pdfSize = screenSizeToPdf(screenSize, info);
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
      onDoubleClick={() => setEditing(true)}
      className={clsx(
        "group",
        isSelected
          ? "ring-2 ring-blue-500"
          : "ring-1 ring-transparent hover:ring-blue-300",
      )}
    >
      <div
        className="w-full h-full"
        style={{
          fontFamily: fontDef.css,
          fontSize: `${fontPx}px`,
          lineHeight: 1.2,
          color: overlay.style.color,
          fontWeight: overlay.style.bold ? 700 : 400,
          fontStyle: overlay.style.italic ? "italic" : "normal",
          textDecoration: overlay.style.underline ? "underline" : "none",
          textAlign: overlay.style.align,
          opacity: overlay.style.opacity,
        }}
      >
        {editing ? (
          <textarea
            ref={textareaRef}
            className="overlay-textarea"
            style={{
              fontFamily: fontDef.css,
              fontSize: `${fontPx}px`,
              lineHeight: 1.2,
              color: overlay.style.color,
              fontWeight: overlay.style.bold ? 700 : 400,
              fontStyle: overlay.style.italic ? "italic" : "normal",
              textDecoration: overlay.style.underline ? "underline" : "none",
              textAlign: overlay.style.align,
            }}
            value={overlay.text}
            onChange={(e) => updateLive({ id: overlay.id, text: e.target.value })}
            onKeyDown={(e) => {
              // ESC exits edit mode (and onBlur will persist the text).
              if (e.key === "Escape") {
                e.stopPropagation();
                textareaRef.current?.blur();
              }
            }}
            onBlur={() => {
              setEditing(false);
              // Persist the final text as a history-creating commit.
              update({ id: overlay.id, text: overlay.text });
            }}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{ whiteSpace: "pre-wrap", overflow: "hidden", wordBreak: "break-word" }}
          >
            {overlay.text || (
              <span className="text-zinc-400 italic">Empty</span>
            )}
          </div>
        )}
      </div>
    </Rnd>
  );
}

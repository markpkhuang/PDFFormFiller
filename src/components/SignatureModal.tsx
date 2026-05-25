"use client";

import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with a transparent PNG data URL and natural dimensions. */
  onSave: (dataUrl: string, width: number, height: number) => void;
}

/**
 * SignatureModal
 *
 * Draws into a transparent canvas. We trim the surrounding empty pixels so
 * the exported signature image hugs the stroke bounds — this matters for
 * coordinate accuracy: the user sees the signature anchored to its visible
 * bounding box, not a giant transparent rectangle.
 */
export default function SignatureModal({ open, onClose, onSave }: Props) {
  const sigRef = useRef<SignatureCanvas>(null);
  const [color, setColor] = useState("#0a2540");

  if (!open) return null;

  const handleSave = () => {
    const pad = sigRef.current;
    if (!pad || pad.isEmpty()) return;
    // Trim to the actual ink bounds so the signature overlay isn't huge.
    const trimmed = trimCanvas(pad.getCanvas());
    if (!trimmed) return;
    const url = trimmed.toDataURL("image/png");
    onSave(url, trimmed.width, trimmed.height);
    pad.clear();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Draw your signature</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded bg-white">
          <SignatureCanvas
            ref={sigRef}
            penColor={color}
            backgroundColor="rgba(0,0,0,0)"
            canvasProps={{
              width: 640,
              height: 240,
              className: "w-full h-60",
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            <label className="text-sm">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => sigRef.current?.clear()}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-sm"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              Add signature
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Trim transparent pixels from a canvas. Returns a new canvas containing
 * only the bounding box of non-transparent pixels, or null if empty.
 */
function trimCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  let top = height,
    bottom = 0,
    left = width,
    right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a !== 0) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (right < left || bottom < top) return null;

  // Add a small breathing margin (2px) so strokes don't touch the edge.
  const margin = 2;
  top = Math.max(0, top - margin);
  left = Math.max(0, left - margin);
  bottom = Math.min(height - 1, bottom + margin);
  right = Math.min(width - 1, right + margin);

  const w = right - left + 1;
  const h = bottom - top + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  octx.drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out;
}

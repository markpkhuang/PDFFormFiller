"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Overlay, OverlayPatch } from "@/types/overlay";

/**
 * Core editor state.
 *
 * Two unrelated concerns share this store deliberately:
 *   1. PDF document state (file bytes, page metadata, page order/rotation)
 *   2. Overlay state (positions stored in PDF points, see lib/coordinates.ts)
 *
 * Undo/redo is implemented with a simple snapshot-based history. We only
 * snapshot user-meaningful states (add/update/delete overlay, page edits),
 * not every keystroke; pure mid-drag state is debounced through `pushHistory`
 * called once on drag end.
 */

export interface PageMeta {
  /** Original 1-indexed page number in the source PDF. */
  originalIndex: number;
  /** Native PDF page width in points (unrotated). */
  pdfWidth: number;
  /** Native PDF page height in points (unrotated). */
  pdfHeight: number;
  /** Rotation in degrees, 0/90/180/270. */
  rotation: 0 | 90 | 180 | 270;
}

export interface DocumentState {
  fileName: string;
  /** Raw original PDF bytes; used by pdf-lib at export. */
  fileBytes: Uint8Array;
  /** Logical page order, length = current page count. */
  pages: PageMeta[];
}

interface HistorySnapshot {
  overlays: Overlay[];
  pages: PageMeta[];
}

interface EditorState {
  document: DocumentState | null;
  overlays: Overlay[];
  /** id of the currently selected overlay (single-select for now). */
  selectedId: string | null;
  /** Clipboard for copy/paste. */
  clipboard: Overlay | null;

  // Zoom is purely a view concern, not exported. PDF-space is unaffected.
  zoom: number;

  // Undo/redo history.
  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // — document —
  loadDocument: (doc: DocumentState) => void;
  resetDocument: () => void;

  // — pages —
  reorderPages: (from: number, to: number) => void;
  rotatePage: (pageIndex: number, delta: 90 | -90) => void;
  deletePage: (pageIndex: number) => void;

  // — overlays —
  addOverlay: (overlay: Overlay) => void;
  updateOverlay: (patch: OverlayPatch) => void;
  /** Mid-drag update that does NOT push history. */
  updateOverlayLive: (patch: OverlayPatch) => void;
  /** Commit current state to history (call on drag/resize end). */
  commit: () => void;
  removeOverlay: (id: string) => void;
  duplicateOverlay: (id: string) => void;

  setSelected: (id: string | null) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;

  copySelected: () => void;
  paste: () => void;

  setZoom: (z: number) => void;

  undo: () => void;
  redo: () => void;
}

const HISTORY_LIMIT = 50;

function snapshot(state: EditorState): HistorySnapshot {
  return {
    overlays: state.overlays.map((o) => ({ ...o })),
    pages: state.document ? state.document.pages.map((p) => ({ ...p })) : [],
  };
}

function applySnapshot(state: EditorState, snap: HistorySnapshot): Partial<EditorState> {
  return {
    overlays: snap.overlays.map((o) => ({ ...o })),
    document: state.document
      ? { ...state.document, pages: snap.pages.map((p) => ({ ...p })) }
      : state.document,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  overlays: [],
  selectedId: null,
  clipboard: null,
  zoom: 1,
  past: [],
  future: [],

  loadDocument: (doc) =>
    set({
      document: doc,
      overlays: [],
      selectedId: null,
      past: [],
      future: [],
      zoom: 1,
    }),

  resetDocument: () =>
    set({
      document: null,
      overlays: [],
      selectedId: null,
      past: [],
      future: [],
    }),

  reorderPages: (from, to) => {
    const state = get();
    if (!state.document) return;
    const pages = [...state.document.pages];
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved);
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      document: { ...state.document, pages },
    });
  },

  rotatePage: (pageIndex, delta) => {
    const state = get();
    if (!state.document) return;
    const pages = state.document.pages.map((p, i) => {
      if (i !== pageIndex) return p;
      const next = (((p.rotation + delta) % 360) + 360) % 360;
      return { ...p, rotation: next as 0 | 90 | 180 | 270 };
    });
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      document: { ...state.document, pages },
    });
  },

  deletePage: (pageIndex) => {
    const state = get();
    if (!state.document) return;
    const pages = state.document.pages.filter((_, i) => i !== pageIndex);
    // Drop overlays that lived on the deleted page; renumber others.
    const deletedPageNum = pageIndex + 1;
    const overlays = state.overlays
      .filter((o) => o.pageNumber !== deletedPageNum)
      .map((o) =>
        o.pageNumber > deletedPageNum ? { ...o, pageNumber: o.pageNumber - 1 } : o,
      );
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      document: { ...state.document, pages },
      overlays,
    });
  },

  addOverlay: (overlay) => {
    const state = get();
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: [...state.overlays, overlay],
      selectedId: overlay.id,
    });
  },

  updateOverlay: (patch) => {
    const state = get();
    const next = state.overlays.map((o) =>
      o.id === patch.id ? ({ ...o, ...patch } as Overlay) : o,
    );
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: next,
    });
  },

  updateOverlayLive: (patch) => {
    set((state) => ({
      overlays: state.overlays.map((o) =>
        o.id === patch.id ? ({ ...o, ...patch } as Overlay) : o,
      ),
    }));
  },

  commit: () => {
    const state = get();
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
    });
  },

  removeOverlay: (id) => {
    const state = get();
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: state.overlays.filter((o) => o.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    });
  },

  duplicateOverlay: (id) => {
    const state = get();
    const o = state.overlays.find((x) => x.id === id);
    if (!o) return;
    const copy: Overlay = {
      ...o,
      id: nanoid(),
      // Offset the copy by 12pt so it's visible.
      x: o.x + 12,
      y: o.y + 12,
      zIndex: maxZ(state.overlays) + 1,
    };
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: [...state.overlays, copy],
      selectedId: copy.id,
    });
  },

  setSelected: (id) => set({ selectedId: id }),

  bringToFront: (id) => {
    const state = get();
    const top = maxZ(state.overlays) + 1;
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: state.overlays.map((o) => (o.id === id ? { ...o, zIndex: top } : o)),
    });
  },

  sendToBack: (id) => {
    const state = get();
    const bottom = minZ(state.overlays) - 1;
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: state.overlays.map((o) => (o.id === id ? { ...o, zIndex: bottom } : o)),
    });
  },

  copySelected: () => {
    const { overlays, selectedId } = get();
    const o = overlays.find((x) => x.id === selectedId);
    if (o) set({ clipboard: { ...o } });
  },

  paste: () => {
    const state = get();
    const o = state.clipboard;
    if (!o) return;
    const copy: Overlay = {
      ...o,
      id: nanoid(),
      x: o.x + 12,
      y: o.y + 12,
      zIndex: maxZ(state.overlays) + 1,
    };
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: [],
      overlays: [...state.overlays, copy],
      selectedId: copy.id,
    });
  },

  setZoom: (z) => set({ zoom: Math.max(0.25, Math.min(4, z)) }),

  undo: () => {
    const state = get();
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    set({
      past: state.past.slice(0, -1),
      future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
      ...applySnapshot(state, prev),
    });
  },

  redo: () => {
    const state = get();
    const next = state.future[0];
    if (!next) return;
    set({
      past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
      ...applySnapshot(state, next),
    });
  },
}));

function maxZ(overlays: Overlay[]): number {
  if (overlays.length === 0) return 0;
  return Math.max(...overlays.map((o) => o.zIndex));
}
function minZ(overlays: Overlay[]): number {
  if (overlays.length === 0) return 0;
  return Math.min(...overlays.map((o) => o.zIndex));
}

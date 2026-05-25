"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { saveDraft } from "@/lib/storage";

/**
 * useAutosave — persists the current document + overlays to IndexedDB
 * roughly every `intervalMs`. Triggered by state changes, throttled.
 *
 * We snapshot the store reactively but only WRITE on a timer to avoid
 * flooding IndexedDB during drags.
 */
export function useAutosave(intervalMs = 3000) {
  const lastSavedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      if (!state.document) return;
      if (timerRef.current) return;
      const elapsed = Date.now() - lastSavedRef.current;
      const delay = Math.max(0, intervalMs - elapsed);
      timerRef.current = setTimeout(async () => {
        timerRef.current = null;
        const s = useEditorStore.getState();
        if (!s.document) return;
        await saveDraft({
          fileName: s.document.fileName,
          fileBytes: s.document.fileBytes,
          pages: s.document.pages,
          overlays: s.overlays,
        });
        lastSavedRef.current = Date.now();
      }, delay);
    });
    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [intervalMs]);
}

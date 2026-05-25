"use client";

/**
 * PDF.js bootstrap.
 *
 * Loads pdfjs-dist lazily on the client only. The worker is served from a
 * CDN to avoid bundling concerns; if you'd rather self-host, copy
 * `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to /public.
 */

import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from "pdfjs-dist/types/src/display/api";

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

export function getPdfJs() {
  if (typeof window === "undefined") {
    throw new Error("pdf.js can only be loaded in the browser");
  }
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export type { PDFDocumentProxy, PDFPageProxy };

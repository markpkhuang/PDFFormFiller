"use client";

/**
 * Local persistence for drafts and templates.
 *
 * IndexedDB stores the binary PDF + serialized state. The schema is
 * intentionally simple — `drafts` for the live in-progress doc, `templates`
 * for explicit user-saved layouts.
 *
 * The data model is designed to map cleanly to a backend SQL/NoSQL store
 * later: each Template is a self-contained JSON document plus a binary
 * blob, so a future sync layer can ship them as-is.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { PageMeta } from "@/store/editorStore";
import type { Overlay } from "@/types/overlay";

const DB_NAME = "pdf-form-filler";
const DB_VERSION = 1;
const DRAFT_KEY = "current";

export interface DraftRecord {
  id: string;
  fileName: string;
  fileBytes: Uint8Array;
  pages: PageMeta[];
  overlays: Overlay[];
  updatedAt: number;
}

export interface TemplateRecord {
  id: string;
  name: string;
  version: number;
  fileName: string;
  fileBytes: Uint8Array;
  pages: PageMeta[];
  overlays: Overlay[];
  createdAt: number;
  updatedAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("templates")) {
          db.createObjectStore("templates", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveDraft(record: Omit<DraftRecord, "id" | "updatedAt">) {
  const db = await getDb();
  await db.put("drafts", { ...record, id: DRAFT_KEY, updatedAt: Date.now() });
}

export async function loadDraft(): Promise<DraftRecord | undefined> {
  const db = await getDb();
  return db.get("drafts", DRAFT_KEY);
}

export async function clearDraft() {
  const db = await getDb();
  await db.delete("drafts", DRAFT_KEY);
}

export async function saveTemplate(record: TemplateRecord) {
  const db = await getDb();
  await db.put("templates", record);
}

export async function listTemplates(): Promise<TemplateRecord[]> {
  const db = await getDb();
  const all = (await db.getAll("templates")) as TemplateRecord[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadTemplate(id: string): Promise<TemplateRecord | undefined> {
  const db = await getDb();
  return db.get("templates", id);
}

export async function deleteTemplate(id: string) {
  const db = await getDb();
  await db.delete("templates", id);
}

"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import {
  type TemplateRecord,
  listTemplates,
  saveTemplate,
  loadTemplate,
  deleteTemplate,
} from "@/lib/storage";
import { useEditorStore } from "@/store/editorStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Lightweight templates UI. Saves a snapshot of the current PDF + overlays
 * as a reusable template. Templates are versioned (monotonic int).
 */
export default function TemplatesPanel({ open, onClose }: Props) {
  const document = useEditorStore((s) => s.document);
  const overlays = useEditorStore((s) => s.overlays);
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) listTemplates().then(setTemplates);
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!document || !name.trim()) return;
    const rec: TemplateRecord = {
      id: nanoid(),
      name: name.trim(),
      version: 1,
      fileName: document.fileName,
      fileBytes: document.fileBytes,
      pages: document.pages,
      overlays,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTemplate(rec);
    setTemplates(await listTemplates());
    setName("");
  };

  const handleLoad = async (id: string) => {
    const t = await loadTemplate(id);
    if (!t) return;
    loadDocument({
      fileName: t.fileName,
      fileBytes: t.fileBytes,
      pages: t.pages,
    });
    useEditorStore.setState({ overlays: t.overlays });
    onClose();
  };

  const handleDuplicate = async (id: string) => {
    const t = await loadTemplate(id);
    if (!t) return;
    const copy: TemplateRecord = {
      ...t,
      id: nanoid(),
      name: `${t.name} (copy)`,
      version: t.version + 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveTemplate(copy);
    setTemplates(await listTemplates());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Templates</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="flex-1 px-2 py-1.5 border rounded dark:bg-zinc-800 dark:border-zinc-700"
          />
          <button
            onClick={handleSave}
            disabled={!document || !name.trim()}
            className="px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            Save current as template
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
          {templates.length === 0 && (
            <div className="text-sm text-zinc-500 py-4">No templates saved yet.</div>
          )}
          {templates.map((t) => (
            <div key={t.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-zinc-500">
                  v{t.version} • {t.overlays.length} overlay(s) • {new Date(t.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => handleLoad(t.id)}
                  className="px-2 py-1 rounded border dark:border-zinc-700"
                >
                  Open
                </button>
                <button
                  onClick={() => handleDuplicate(t.id)}
                  className="px-2 py-1 rounded border dark:border-zinc-700"
                >
                  Duplicate
                </button>
                <button
                  onClick={async () => {
                    await deleteTemplate(t.id);
                    setTemplates(await listTemplates());
                  }}
                  className="px-2 py-1 rounded text-red-600 border border-red-300 dark:border-red-900"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

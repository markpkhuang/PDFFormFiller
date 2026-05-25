"use client";

import { useEditorStore } from "@/store/editorStore";
import type { Overlay, TextOverlay } from "@/types/overlay";
import { FONT_REGISTRY } from "@/lib/fonts";

/**
 * PropertiesPanel
 *
 * Shows the editable properties of the selected overlay. All numeric
 * inputs (position, size, font size) work in PDF points so they map 1:1
 * to the export.
 */
export default function PropertiesPanel() {
  const overlays = useEditorStore((s) => s.overlays);
  const selectedId = useEditorStore((s) => s.selectedId);
  const update = useEditorStore((s) => s.updateOverlay);
  const remove = useEditorStore((s) => s.removeOverlay);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);

  const selected = overlays.find((o) => o.id === selectedId);

  if (!selected) {
    return (
      <div className="w-72 border-l border-zinc-200 dark:border-zinc-800 p-4 text-sm text-zinc-500">
        Select an overlay to edit its properties.
      </div>
    );
  }

  return (
    <div className="w-72 border-l border-zinc-200 dark:border-zinc-800 p-4 text-sm space-y-4 overflow-y-auto">
      <div className="flex justify-between items-center">
        <div className="font-semibold capitalize">{selected.type}</div>
        <button
          onClick={() => remove(selected.id)}
          className="text-red-600 hover:underline text-xs"
        >
          Remove
        </button>
      </div>

      <Section title="Position (pt)">
        <NumGrid overlay={selected} update={update} />
      </Section>

      {selected.type === "text" && (
        <TextStyleEditor overlay={selected} update={update} />
      )}

      {selected.type === "image" && (
        <Section title="Image">
          <Row label="Opacity">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={selected.style.opacity}
              onChange={(e) =>
                update({
                  id: selected.id,
                  style: { ...selected.style, opacity: parseFloat(e.target.value) },
                })
              }
              className="w-full"
            />
          </Row>
          <Row label="Rotation">
            <input
              type="number"
              value={selected.rotation}
              onChange={(e) => update({ id: selected.id, rotation: parseFloat(e.target.value) || 0 })}
              className="w-20 px-1 border rounded dark:bg-zinc-800 dark:border-zinc-700"
            />
          </Row>
        </Section>
      )}

      <Section title="Layer">
        <div className="flex gap-2">
          <button
            onClick={() => bringToFront(selected.id)}
            className="px-2 py-1 border rounded text-xs dark:border-zinc-700"
          >
            Front
          </button>
          <button
            onClick={() => sendToBack(selected.id)}
            className="px-2 py-1 border rounded text-xs dark:border-zinc-700"
          >
            Back
          </button>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={selected.locked}
              onChange={(e) => update({ id: selected.id, locked: e.target.checked })}
            />
            Lock
          </label>
        </div>
      </Section>
    </div>
  );
}

function NumGrid({
  overlay,
  update,
}: {
  overlay: Overlay;
  update: (patch: { id: string } & Partial<Overlay>) => void;
}) {
  const fields: [keyof Overlay & ("x" | "y" | "width" | "height"), string][] = [
    ["x", "X"],
    ["y", "Y"],
    ["width", "W"],
    ["height", "H"],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(([k, label]) => (
        <label key={k} className="flex items-center gap-1 text-xs">
          <span className="w-4 text-zinc-500">{label}</span>
          <input
            type="number"
            value={Math.round((overlay[k] as number) * 100) / 100}
            onChange={(e) =>
              update({ id: overlay.id, [k]: parseFloat(e.target.value) || 0 } as never)
            }
            className="w-full px-1 border rounded dark:bg-zinc-800 dark:border-zinc-700"
          />
        </label>
      ))}
    </div>
  );
}

function TextStyleEditor({
  overlay,
  update,
}: {
  overlay: TextOverlay;
  update: (patch: { id: string } & Partial<TextOverlay>) => void;
}) {
  const set = (patch: Partial<TextOverlay["style"]>) =>
    update({ id: overlay.id, style: { ...overlay.style, ...patch } });

  return (
    <Section title="Text">
      <Row label="Font">
        <select
          value={overlay.style.fontFamily}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="w-full px-1 border rounded dark:bg-zinc-800 dark:border-zinc-700"
        >
          {Object.values(FONT_REGISTRY).map((f) => (
            <option key={f.label} value={f.label}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Size (pt)">
        <input
          type="number"
          min={4}
          max={144}
          value={overlay.style.fontSize}
          onChange={(e) => set({ fontSize: parseFloat(e.target.value) || 12 })}
          className="w-20 px-1 border rounded dark:bg-zinc-800 dark:border-zinc-700"
        />
      </Row>
      <Row label="Color">
        <input
          type="color"
          value={overlay.style.color}
          onChange={(e) => set({ color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer"
        />
      </Row>
      <Row label="Style">
        <div className="flex gap-1">
          <Toggle on={overlay.style.bold} onClick={() => set({ bold: !overlay.style.bold })}>
            <span className="font-bold">B</span>
          </Toggle>
          <Toggle on={overlay.style.italic} onClick={() => set({ italic: !overlay.style.italic })}>
            <span className="italic">I</span>
          </Toggle>
          <Toggle
            on={overlay.style.underline}
            onClick={() => set({ underline: !overlay.style.underline })}
          >
            <span className="underline">U</span>
          </Toggle>
        </div>
      </Row>
      <Row label="Align">
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((a) => (
            <Toggle key={a} on={overlay.style.align === a} onClick={() => set({ align: a })}>
              {a[0].toUpperCase()}
            </Toggle>
          ))}
        </div>
      </Row>
      <Row label="Opacity">
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={overlay.style.opacity}
          onChange={(e) => set({ opacity: parseFloat(e.target.value) })}
          className="w-full"
        />
      </Row>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-500 w-16">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "w-7 h-7 text-xs rounded border " +
        (on
          ? "bg-blue-600 text-white border-blue-600"
          : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
      }
    >
      {children}
    </button>
  );
}

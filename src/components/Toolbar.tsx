"use client";

import { useRef } from "react";
import clsx from "clsx";

export type Tool = "select" | "text" | "signature" | "image";

interface Props {
  activeTool: Tool;
  setActiveTool: (t: Tool) => void;
  onSignatureClick: () => void;
  onImageFile: (file: File) => void;
  onExport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
  zoom: number;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  fileName: string;
  onSaveDraft: () => void;
  onCloseDocument: () => void;
  hasSelection: boolean;
}

export default function Toolbar({
  activeTool,
  setActiveTool,
  onSignatureClick,
  onImageFile,
  onExport,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
  zoom,
  onUndo,
  onRedo,
  onDuplicate,
  onDelete,
  fileName,
  onSaveDraft,
  onCloseDocument,
  hasSelection,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="h-12 flex items-center gap-1 px-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm">
      <button
        onClick={onCloseDocument}
        className="px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
        title="Open a different PDF"
      >
        ← New
      </button>
      <div className="px-2 text-zinc-500 truncate max-w-[200px]" title={fileName}>
        {fileName}
      </div>
      <Divider />

      <TBtn active={activeTool === "select"} onClick={() => setActiveTool("select")} title="Select / move (V)">
        ▭ Select
      </TBtn>
      <TBtn active={activeTool === "text"} onClick={() => setActiveTool("text")} title="Add text (T)">
        T Text
      </TBtn>
      <TBtn
        active={false}
        onClick={() => {
          onSignatureClick();
        }}
        title="Add signature (S)"
      >
        ✎ Sign
      </TBtn>
      <TBtn
        active={false}
        onClick={() => fileInput.current?.click()}
        title="Add image"
      >
        🖼 Image
      </TBtn>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImageFile(f);
          e.currentTarget.value = "";
        }}
      />

      <Divider />

      <TBtn onClick={onUndo} title="Undo (⌘/Ctrl Z)">↶</TBtn>
      <TBtn onClick={onRedo} title="Redo (⌘/Ctrl ⇧ Z)">↷</TBtn>
      <TBtn onClick={onDuplicate} disabled={!hasSelection} title="Duplicate (⌘/Ctrl D)">
        ⎘
      </TBtn>
      <TBtn onClick={onDelete} disabled={!hasSelection} title="Delete (⌫)">
        🗑
      </TBtn>

      <Divider />

      <TBtn onClick={onZoomOut} title="Zoom out">−</TBtn>
      <div className="px-2 text-zinc-500 tabular-nums">{Math.round(zoom * 100)}%</div>
      <TBtn onClick={onZoomIn} title="Zoom in">+</TBtn>
      <TBtn onClick={onFitWidth} title="Fit width">↔</TBtn>
      <TBtn onClick={onFitPage} title="Fit page">⛶</TBtn>

      <div className="flex-1" />

      <button
        onClick={onSaveDraft}
        className="px-3 py-1.5 rounded text-sm border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        Save draft
      </button>
      <button
        onClick={onExport}
        className="ml-2 px-3 py-1.5 rounded bg-blue-600 text-white text-sm hover:bg-blue-700"
      >
        Export PDF
      </button>
    </div>
  );
}

function TBtn({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "px-2 py-1 rounded text-sm",
        active
          ? "bg-blue-600 text-white"
          : "hover:bg-zinc-100 dark:hover:bg-zinc-800",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />;
}

import dynamic from "next/dynamic";

// Editor is client-only (PDF.js + canvas + IndexedDB).
const Editor = dynamic(() => import("@/components/Editor"), { ssr: false });

export default function Page() {
  return <Editor />;
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Form Filler",
  description:
    "Lightweight browser-based PDF editor: fill forms, sign, and export flattened PDFs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-canvas-light text-zinc-900 dark:bg-canvas-dark dark:text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}

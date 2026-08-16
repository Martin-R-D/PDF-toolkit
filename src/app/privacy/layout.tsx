import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "LocalPDF processes everything in your browser. No files, contents or metadata are ever uploaded, and there is no file analytics of any kind.",
  alternates: { canonical: "/privacy" },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

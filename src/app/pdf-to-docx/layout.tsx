import type { ReactNode } from "react";
import { toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("/pdf-to-docx");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

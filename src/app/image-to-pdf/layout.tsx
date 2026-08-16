import type { ReactNode } from "react";
import { toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("/image-to-pdf");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

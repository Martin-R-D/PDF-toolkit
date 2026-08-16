import type { ReactNode } from "react";
import { toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("/split");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

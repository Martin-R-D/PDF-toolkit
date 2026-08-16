import type { ReactNode } from "react";
import { toolMetadata } from "@/lib/seo";

export const metadata = toolMetadata("/compare");

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}

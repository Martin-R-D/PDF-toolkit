import type { Metadata } from "next";
import { tools } from "@/lib/tools";

export const SITE_NAME = "LocalPDF";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://localpdf.app";
export const SITE_DESCRIPTION =
  "Every PDF tool you need, running 100% in your browser. Merge, split, edit, compress, OCR and convert PDFs — free, private, and offline. Your files never leave your device.";

/** Build per-tool metadata from the shared tools list so titles/descriptions
 * stay in sync with the homepage. */
export function toolMetadata(href: string): Metadata {
  const tool = tools.find((t) => t.href === href);
  const title = tool?.title ?? SITE_NAME;
  const description = tool
    ? `${tool.description}. Free and 100% private — everything runs in your browser.`
    : SITE_DESCRIPTION;

  return {
    title,
    description,
    alternates: { canonical: href },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: href,
      type: "website",
      siteName: SITE_NAME,
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: ["/og-image.png"],
    },
  };
}

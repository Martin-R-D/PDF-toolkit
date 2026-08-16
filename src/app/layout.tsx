import type { Metadata, Viewport } from "next";
import { Roboto, Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SITE_NAME, SITE_URL, SITE_DESCRIPTION } from "@/lib/seo";
import Link from "next/link";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-sans",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Every PDF tool, 100% in your browser`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: SITE_NAME },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Every PDF tool, 100% in your browser`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Every PDF tool, 100% in your browser`,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${roboto.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <FileText className="h-5 w-5" />
                PDF Toolkit
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  100% client-side
                </Badge>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t py-6 text-center text-sm text-muted-foreground">
            <p>
              All processing happens in your browser. No files are ever
              uploaded.
            </p>
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy
            </Link>
          </footer>
          <Toaster richColors />
          <ServiceWorkerRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}

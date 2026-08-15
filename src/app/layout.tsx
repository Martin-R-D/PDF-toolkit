import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PDF Toolkit",
  description:
    "Every PDF tool you need, right in your browser. 100% client-side.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
        </ThemeProvider>
      </body>
    </html>
  );
}

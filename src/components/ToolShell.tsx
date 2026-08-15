"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface ToolShellProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function ToolShell({ title, description, children }: ToolShellProps) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          All tools
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LoadErrorProps {
  message: string;
  onRetry: () => void;
}

export function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
      <div className="flex items-center gap-2 font-medium text-destructive">
        <AlertCircle className="h-4 w-4" />
        Could not load this PDF
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try another file
      </Button>
    </div>
  );
}

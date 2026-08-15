"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ProcessButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  progress?: number;
  children: ReactNode;
}

export function ProcessButton({
  onClick,
  disabled,
  loading,
  progress,
  children,
}: ProcessButtonProps) {
  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        disabled={disabled || loading}
        className="w-full"
        size="lg"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </Button>
      {loading && progress !== undefined && (
        <Progress value={progress} className="h-2" />
      )}
    </div>
  );
}

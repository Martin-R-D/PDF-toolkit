"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, File, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FileDropzoneProps {
  accept: Record<string, string[]>;
  multiple?: boolean;
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxSizeMb?: number;
  hint?: string;
}

export function FileDropzone({
  accept,
  multiple = false,
  files,
  onFilesChange,
  maxSizeMb = 100,
  hint,
}: FileDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      for (const r of rejections) {
        const reasons = r.errors.map((e) => e.message).join(", ");
        toast.error(`${r.file.name}: ${reasons}`);
      }
      if (accepted.length === 0) return;
      onFilesChange(multiple ? [...files, ...accepted] : accepted);
    },
    [files, multiple, onFilesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
    maxSize: maxSizeMb * 1024 * 1024,
  });

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          Drag &amp; drop files here or click to browse
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{file.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {files.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFilesChange([])}
            >
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

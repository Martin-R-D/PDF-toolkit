"use client";

import { useState, useEffect } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { PageThumbGrid } from "@/components/PageThumbGrid";
import { ProcessButton } from "@/components/ProcessButton";
import { ThumbGridSkeleton } from "@/components/ThumbGridSkeleton";
import { LoadError } from "@/components/LoadError";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useThumbnails } from "@/hooks/useThumbnails";
import { fileToBytes } from "@/lib/pdf/load";
import { downloadBytes } from "@/lib/download";

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export default function RotatePage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const { thumbs, loading, progress, error, cancel } = useThumbnails(file);

  const [rotations, setRotations] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRotations(new Array(thumbs.length).fill(0));
  }, [thumbs]);

  const startOver = () => setFiles([]);

  const rotatePage = (index: number, delta: number) => {
    setRotations((prev) =>
      prev.map((r, i) => (i === index ? norm(r + delta) : r))
    );
  };

  const rotateAll = (delta: number) => {
    setRotations((prev) => prev.map((r) => norm(r + delta)));
  };

  const reset = () => setRotations((prev) => prev.map(() => 0));

  const handleApply = async () => {
    setBusy(true);
    try {
      const bytes = await fileToBytes(file);
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(
          `Could not read "${file.name}". It may be corrupt or password-protected.`
        );
      }
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        page.setRotation(degrees(norm(page.getRotation().angle + rotations[i])));
      });
      const out = await doc.save();
      downloadBytes(out, "rotated.pdf");
      toast.success("Rotated PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell title="Rotate Pages" description="Fix page orientation.">
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && <EmptyState>Choose a PDF above to rotate its pages.</EmptyState>}

      {error && <LoadError message={error} onRetry={startOver} />}

      {file && loading && (
        <ThumbGridSkeleton progress={progress} onCancel={cancel} />
      )}

      {!loading && !error && thumbs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="max-sm:flex-1"
              onClick={() => rotateAll(-90)}
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              Rotate all left
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="max-sm:flex-1"
              onClick={() => rotateAll(90)}
            >
              <RotateCw className="mr-1 h-4 w-4" />
              Rotate all right
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              Reset
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={startOver}
            >
              Start over
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            You can also rotate individual pages using the buttons on each page.
          </p>

          <PageThumbGrid
            thumbs={thumbs}
            itemStyle={(i) => ({
              transform: `rotate(${rotations[i] ?? 0}deg)`,
            })}
            renderOverlay={(i) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    rotatePage(i, -90);
                  }}
                  className="rounded bg-background/80 p-1 shadow hover:bg-background"
                  aria-label={`Rotate page ${i + 1} left`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    rotatePage(i, 90);
                  }}
                  className="rounded bg-background/80 p-1 shadow hover:bg-background"
                  aria-label={`Rotate page ${i + 1} right`}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          />

          <ProcessButton onClick={handleApply} loading={busy}>
            Apply rotation
          </ProcessButton>
        </>
      )}
    </ToolShell>
  );
}

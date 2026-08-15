"use client";

import { useState, useEffect } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { RotateCcw, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { PageThumbGrid } from "@/components/PageThumbGrid";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fileToBytes } from "@/lib/pdf/load";
import { generateThumbnails } from "@/lib/pdf/render";
import { downloadBytes } from "@/lib/download";

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export default function RotatePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [rotations, setRotations] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const file = files[0];

  useEffect(() => {
    if (!file) {
      setThumbs([]);
      setRotations([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setThumbLoading(true);
      setThumbProgress(0);
      try {
        const result = await generateThumbnails(file, 0.3, (done, total) => {
          if (!cancelled) setThumbProgress(Math.round((done / total) * 100));
        });
        if (!cancelled) {
          setThumbs(result);
          setRotations(new Array(result.length).fill(0));
        }
      } catch (err) {
        if (!cancelled) {
          toast.error((err as Error).message);
          setFiles([]);
        }
      } finally {
        if (!cancelled) setThumbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const rotatePage = (index: number, delta: number) => {
    setRotations((prev) =>
      prev.map((r, i) => (i === index ? norm(r + delta) : r))
    );
  };

  const rotateAll = (delta: number) => {
    setRotations((prev) => prev.map((r) => norm(r + delta)));
  };

  const reset = () => {
    setRotations((prev) => prev.map(() => 0));
  };

  const handleApply = async () => {
    setLoading(true);
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
      setLoading(false);
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

      {thumbLoading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Rendering pages…</p>
          <Progress value={thumbProgress} className="h-2" />
        </div>
      )}

      {!thumbLoading && thumbs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => rotateAll(-90)}>
              <RotateCcw className="mr-1 h-4 w-4" />
              Rotate all left
            </Button>
            <Button variant="outline" size="sm" onClick={() => rotateAll(90)}>
              <RotateCw className="mr-1 h-4 w-4" />
              Rotate all right
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              Reset
            </Button>
            <span className="text-sm text-muted-foreground">
              You can also rotate individual pages using the buttons on each page.
            </span>
          </div>

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

          <ProcessButton onClick={handleApply} loading={loading}>
            Apply rotation
          </ProcessButton>
        </>
      )}
    </ToolShell>
  );
}

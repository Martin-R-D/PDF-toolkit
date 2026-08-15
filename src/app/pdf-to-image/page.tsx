"use client";

import { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { PageThumbGrid } from "@/components/PageThumbGrid";
import { ProcessButton } from "@/components/ProcessButton";
import { ThumbGridSkeleton } from "@/components/ThumbGridSkeleton";
import { LoadError } from "@/components/LoadError";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useThumbnails } from "@/hooks/useThumbnails";
import { useYieldingLoop } from "@/hooks/useYieldingLoop";
import { getPdfJsDoc, renderPageToCanvas } from "@/lib/pdf/render";
import { downloadDataUrl, downloadZip } from "@/lib/download";

interface ImageResult {
  page: number;
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

export default function PdfToImagePage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const {
    thumbs,
    loading: thumbLoading,
    progress: thumbProgress,
    error,
    cancel: cancelThumbs,
  } = useThumbnails(file);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(0.92);
  const [dpi, setDpi] = useState("150");
  const [results, setResults] = useState<ImageResult[]>([]);

  const { run, cancel, running, progress } = useYieldingLoop();

  const baseName = file ? file.name.replace(/\.pdf$/i, "") : "document";

  useEffect(() => {
    setResults([]);
    setSelected(new Set(thumbs.map((_, i) => i)));
  }, [thumbs]);

  const startOver = () => setFiles([]);

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleConvert = async () => {
    setResults([]);
    try {
      if (selected.size === 0) throw new Error("Select at least one page.");
      const scale = parseInt(dpi, 10) / 72;
      const doc = await getPdfJsDoc(file);
      const pages = Array.from(selected).sort((a, b) => a - b);
      const type = format === "png" ? "image/png" : "image/jpeg";
      const ext = format === "png" ? "png" : "jpg";

      const out = await run<ImageResult>(pages.length, async (i) => {
        const pageNum = pages[i] + 1;
        const canvas = await renderPageToCanvas(doc, pageNum, scale);
        const dataUrl = canvas.toDataURL(type, quality);
        const result: ImageResult = {
          page: pageNum,
          dataUrl,
          width: canvas.width,
          height: canvas.height,
          name: `page-${pageNum}.${ext}`,
        };
        canvas.width = 0;
        canvas.height = 0;
        return result;
      });

      if (out === null) {
        toast.info("Conversion cancelled.");
        return;
      }
      setResults(out);
      toast.success(`Converted ${out.length} page${out.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleZip = async () => {
    try {
      await downloadZip(
        results.map((r) => ({ name: r.name, data: r.dataUrl })),
        `${baseName}-images.zip`
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ToolShell title="PDF to Image" description="Export pages as PNG or JPG.">
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && (
        <EmptyState>Choose a PDF above to export its pages as images.</EmptyState>
      )}

      {error && <LoadError message={error} onRetry={startOver} />}

      {file && thumbLoading && (
        <ThumbGridSkeleton progress={thumbProgress} onCancel={cancelThumbs} />
      )}

      {!thumbLoading && !error && thumbs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(thumbs.map((_, i) => i)))}
            >
              Select all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Deselect all
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

          <PageThumbGrid thumbs={thumbs} selected={selected} onToggle={toggle} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={format}
                onValueChange={(v) => v && setFormat(v as "png" | "jpeg")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>DPI</Label>
              <Select value={dpi} onValueChange={(v) => v && setDpi(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="72">72</SelectItem>
                  <SelectItem value="150">150</SelectItem>
                  <SelectItem value="300">300</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {format === "jpeg" && (
              <div className="space-y-2">
                <Label>Quality: {quality.toFixed(2)}</Label>
                <Slider
                  min={0.5}
                  max={1}
                  step={0.02}
                  value={[quality]}
                  onValueChange={(v) =>
                    setQuality(Array.isArray(v) ? v[0] : v)
                  }
                />
              </div>
            )}
          </div>

          <ProcessButton
            onClick={handleConvert}
            disabled={selected.size === 0}
            loading={running}
            progress={progress}
          >
            Convert {selected.size} page{selected.size === 1 ? "" : "s"}
          </ProcessButton>
          {running && (
            <Button
              variant="outline"
              className="w-full"
              onClick={cancel}
            >
              Cancel
            </Button>
          )}
        </>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Results</h2>
            <Button onClick={handleZip} className="max-sm:w-full">
              <Download className="mr-2 h-4 w-4" />
              Download all as ZIP
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {results.map((r) => (
              <div
                key={r.page}
                className="space-y-2 rounded-lg border bg-card p-2 text-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.dataUrl}
                  alt={r.name}
                  className="mx-auto h-auto w-full rounded border"
                />
                <p className="truncate text-xs font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.width} × {r.height}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => downloadDataUrl(r.dataUrl, r.name)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { LoadError } from "@/components/LoadError";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useYieldingLoop } from "@/hooks/useYieldingLoop";
import { loadPdfDoc } from "@/lib/pdf/load";
import { getPdfJsDoc, renderPageToCanvas } from "@/lib/pdf/render";
import { downloadBytes } from "@/lib/download";
import { formatBytes } from "@/lib/format";

interface Result {
  bytes: Uint8Array;
  newSize: number;
}

export default function CompressPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];

  const [dpi, setDpi] = useState("150");
  const [quality, setQuality] = useState(0.6);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { run, cancel, running, progress } = useYieldingLoop();

  const originalSize = file?.size ?? 0;

  useEffect(() => {
    setResult(null);
    setLoadError(null);
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        await loadPdfDoc(file);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const startOver = () => setFiles([]);

  const handleLossless = async () => {
    setBusy(true);
    setResult(null);
    try {
      const doc = await loadPdfDoc(file);
      const out = await doc.save({ useObjectStreams: true });
      setResult({ bytes: out, newSize: out.byteLength });
      toast.success("Compression complete.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAggressive = async () => {
    setResult(null);
    try {
      const src = await loadPdfDoc(file);
      const dpiNum = parseInt(dpi, 10);
      const scale = dpiNum / 72;
      const pdfDoc = await getPdfJsDoc(file);
      const total = src.getPageCount();
      const out = await PDFDocument.create();

      const done = await run<null>(total, async (i) => {
        const srcPage = src.getPage(i);
        const { width, height } = srcPage.getSize();
        const canvas = await renderPageToCanvas(pdfDoc, i + 1, scale);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const jpg = await out.embedJpg(dataUrl);
        const newPage = out.addPage([width, height]);
        newPage.drawImage(jpg, { x: 0, y: 0, width, height });
        canvas.width = 0;
        canvas.height = 0;
        return null;
      });

      if (done === null) {
        toast.info("Compression cancelled.");
        return;
      }

      const bytes = await out.save();
      setResult({ bytes, newSize: bytes.byteLength });
      toast.success("Compression complete.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const savedPct =
    result && originalSize > 0
      ? Math.round((1 - result.newSize / originalSize) * 100)
      : 0;

  const resultCard = result && (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Original size</span>
          <span>{formatBytes(originalSize)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">New size</span>
          <span>{formatBytes(result.newSize)}</span>
        </div>
        {savedPct > 0 ? (
          <p className="text-sm font-medium text-emerald-600">
            Saved {savedPct}%
          </p>
        ) : (
          <p className="text-sm font-medium text-amber-600">
            This mode made the file {Math.abs(savedPct)}% larger. Try the other
            mode or different settings.
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            onClick={() => downloadBytes(result.bytes, "compressed.pdf")}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button variant="outline" onClick={startOver}>
            Start over
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <ToolShell title="Compress PDF" description="Shrink file size.">
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && <EmptyState>Choose a PDF above to compress it.</EmptyState>}

      {loadError && <LoadError message={loadError} onRetry={startOver} />}

      {file && !loadError && (
        <>
          <p className="text-sm text-muted-foreground">
            Original size: {formatBytes(originalSize)}
          </p>

          <Tabs defaultValue="lossless" className="space-y-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="lossless">Lossless</TabsTrigger>
              <TabsTrigger value="aggressive">
                Aggressive (rasterize)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="lossless" className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Re-saves the file with optimized object streams. Savings are
                modest, but text stays selectable.
              </p>
              <ProcessButton onClick={handleLossless} loading={busy}>
                Compress
              </ProcessButton>
              {resultCard}
            </TabsContent>

            <TabsContent value="aggressive" className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Text will become part of the image and will no longer be
                  selectable or searchable.
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>DPI</Label>
                  <Select value={dpi} onValueChange={(v) => v && setDpi(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="72">72 (screen)</SelectItem>
                      <SelectItem value="150">150 (default)</SelectItem>
                      <SelectItem value="300">300 (print)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>JPEG quality: {quality.toFixed(2)}</Label>
                  <Slider
                    min={0.3}
                    max={0.9}
                    step={0.05}
                    value={[quality]}
                    onValueChange={(v) =>
                      setQuality(Array.isArray(v) ? v[0] : v)
                    }
                  />
                </div>
              </div>

              <ProcessButton
                onClick={handleAggressive}
                loading={running}
                progress={progress}
              >
                Compress
              </ProcessButton>
              {running && (
                <Button variant="outline" className="w-full" onClick={cancel}>
                  Cancel
                </Button>
              )}
              {resultCard}
            </TabsContent>
          </Tabs>
        </>
      )}
    </ToolShell>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { PDFDocument } from "pdf-lib";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { PageThumbGrid } from "@/components/PageThumbGrid";
import { ProcessButton } from "@/components/ProcessButton";
import { ThumbGridSkeleton } from "@/components/ThumbGridSkeleton";
import { LoadError } from "@/components/LoadError";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useThumbnails } from "@/hooks/useThumbnails";
import { fileToBytes } from "@/lib/pdf/load";
import { downloadBytes, downloadZip } from "@/lib/download";
import { parseRanges } from "@/lib/parseRanges";

export default function SplitPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const { thumbs, loading, progress, error, cancel } = useThumbnails(file);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeText, setRangeText] = useState("");
  const [rangeSeparate, setRangeSeparate] = useState(false);
  const [everyN, setEveryN] = useState(1);
  const [busy, setBusy] = useState(false);

  const pageCount = thumbs.length;
  const originalName = file ? file.name.replace(/\.pdf$/i, "") : "document";

  useEffect(() => {
    setSelected(new Set());
    setRangeText("");
    setRangeSeparate(false);
    setEveryN(1);
  }, [file]);

  const startOver = () => setFiles([]);

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const rangeError = useMemo(() => {
    if (!rangeText.trim() || !pageCount) return null;
    try {
      parseRanges(rangeText, pageCount);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [rangeText, pageCount]);

  const everyNCount = useMemo(() => {
    if (!pageCount || everyN < 1) return 0;
    return Math.ceil(pageCount / everyN);
  }, [pageCount, everyN]);

  async function loadSource() {
    const bytes = await fileToBytes(file);
    try {
      return await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      throw new Error(
        `Could not read "${file.name}". It may be corrupt or password-protected.`
      );
    }
  }

  async function buildPdf(src: PDFDocument, pageIndices: number[]) {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, pageIndices);
    pages.forEach((p) => out.addPage(p));
    return out.save();
  }

  const handleExtract = async () => {
    setBusy(true);
    try {
      if (selected.size === 0) throw new Error("Select at least one page.");
      const src = await loadSource();
      const indices = Array.from(selected).sort((a, b) => a - b);
      const bytes = await buildPdf(src, indices);
      downloadBytes(bytes, "extracted.pdf");
      toast.success("Extracted PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRanges = async () => {
    setBusy(true);
    try {
      const src = await loadSource();
      if (rangeSeparate) {
        const tokens = rangeText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (tokens.length === 0) throw new Error("Enter at least one range.");
        const outFiles: { name: string; data: Uint8Array }[] = [];
        for (let i = 0; i < tokens.length; i++) {
          const pages = parseRanges(tokens[i], pageCount);
          const bytes = await buildPdf(
            src,
            pages.map((p) => p - 1)
          );
          outFiles.push({ name: `range-${i + 1}.pdf`, data: bytes });
        }
        await downloadZip(outFiles, `${originalName}-split.zip`);
      } else {
        const pages = parseRanges(rangeText, pageCount);
        const bytes = await buildPdf(
          src,
          pages.map((p) => p - 1)
        );
        downloadBytes(bytes, "extracted.pdf");
      }
      toast.success("Done.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleEveryN = async () => {
    setBusy(true);
    try {
      if (everyN < 1) throw new Error("Enter a number of at least 1.");
      const src = await loadSource();
      const outFiles: { name: string; data: Uint8Array }[] = [];
      let part = 1;
      for (let start = 0; start < pageCount; start += everyN) {
        const indices: number[] = [];
        for (let i = start; i < Math.min(start + everyN, pageCount); i++) {
          indices.push(i);
        }
        const bytes = await buildPdf(src, indices);
        outFiles.push({ name: `part-${part}.pdf`, data: bytes });
        part++;
      }
      await downloadZip(outFiles, `${originalName}-split.zip`);
      toast.success("Done.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ToolShell
      title="Split PDF"
      description="Extract pages or split into several files."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && (
        <EmptyState>Choose a PDF above to see its pages.</EmptyState>
      )}

      {error && <LoadError message={error} onRetry={startOver} />}

      {file && loading && (
        <ThumbGridSkeleton progress={progress} onCancel={cancel} />
      )}

      {!loading && !error && thumbs.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pageCount} pages</p>
            <Button variant="ghost" size="sm" onClick={startOver}>
              Start over
            </Button>
          </div>

          <Tabs defaultValue="extract" className="space-y-4">
            <TabsList className="flex-wrap">
              <TabsTrigger value="extract">Extract pages</TabsTrigger>
              <TabsTrigger value="ranges">Custom ranges</TabsTrigger>
              <TabsTrigger value="every">Split every N pages</TabsTrigger>
            </TabsList>

            <TabsContent value="extract" className="space-y-4">
              <div className="flex flex-wrap gap-2">
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
              </div>
              <PageThumbGrid
                thumbs={thumbs}
                selected={selected}
                onToggle={toggle}
              />
              <ProcessButton
                onClick={handleExtract}
                disabled={selected.size === 0}
                loading={busy}
              >
                Extract {selected.size} page{selected.size === 1 ? "" : "s"}
              </ProcessButton>
            </TabsContent>

            <TabsContent value="ranges" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ranges">Page ranges</Label>
                <Input
                  id="ranges"
                  placeholder="1-3, 5, 8-10"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                />
                {rangeError && (
                  <p className="text-sm text-destructive">{rangeError}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="separate"
                  checked={rangeSeparate}
                  onCheckedChange={(v) => setRangeSeparate(v === true)}
                />
                <Label htmlFor="separate" className="font-normal">
                  Save each range as a separate file
                </Label>
              </div>
              <ProcessButton
                onClick={handleRanges}
                disabled={!rangeText.trim() || !!rangeError}
                loading={busy}
              >
                Split
              </ProcessButton>
            </TabsContent>

            <TabsContent value="every" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="everyn">Pages per file</Label>
                <Input
                  id="everyn"
                  type="number"
                  min={1}
                  value={everyN}
                  onChange={(e) =>
                    setEveryN(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
              </div>
              <p className="text-sm text-muted-foreground">
                This will create {everyNCount} file
                {everyNCount === 1 ? "" : "s"}.
              </p>
              <ProcessButton
                onClick={handleEveryN}
                disabled={everyN < 1}
                loading={busy}
              >
                Split
              </ProcessButton>
            </TabsContent>
          </Tabs>
        </>
      )}
    </ToolShell>
  );
}

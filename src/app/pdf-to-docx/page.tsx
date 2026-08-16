"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { EmptyState } from "@/components/EmptyState";
import { LoadError } from "@/components/LoadError";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useYieldingLoop } from "@/hooks/useYieldingLoop";
import { getPdfJsDoc } from "@/lib/pdf/render";
import { loadPdfDoc } from "@/lib/pdf/load";
import {
  extractPage,
  type ExtractOptions,
  type PageBlocks,
  type Block,
} from "@/lib/docx/extract";
import { buildDocx } from "@/lib/docx/build";

const OPTIONS: { key: keyof ExtractOptions; label: string }[] = [
  { key: "mergeParagraphs", label: "Merge into paragraphs" },
  { key: "detectHeadings", label: "Detect headings" },
  { key: "detectLists", label: "Detect lists" },
  { key: "detectTables", label: "Detect tables" },
  { key: "detectColumns", label: "Detect columns" },
  { key: "includeImages", label: "Include images" },
  { key: "preserveHyperlinks", label: "Preserve hyperlinks" },
];

function blockTag(b: Block): string {
  if (b.kind === "image") return "Image";
  if (b.kind === "table") return `Table ${b.rows.length}×${b.colWidths.length}`;
  if (b.heading) return `H${b.heading}`;
  if (b.list) return "List";
  return "Body";
}

function blockText(b: Block): string {
  if (b.kind === "image") return `${Math.round(b.widthPt)}×${Math.round(b.heightPt)} pt`;
  if (b.kind === "table") return b.rows[0]?.join(" | ") ?? "";
  return b.runs.map((r) => r.text).join("");
}

export default function PdfToDocxPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];

  const [opts, setOpts] = useState<ExtractOptions>({
    mergeParagraphs: true,
    detectHeadings: true,
    detectLists: true,
    detectTables: true,
    detectColumns: false,
    includeImages: true,
    preserveHyperlinks: true,
  });

  const [pages, setPages] = useState<PageBlocks[] | null>(null);
  const [stale, setStale] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const { run, cancel, running, progress } = useYieldingLoop();

  const startOver = () => {
    setFiles([]);
    setPages(null);
    setLoadError(null);
  };

  const toggle = (key: keyof ExtractOptions) => {
    setOpts((o) => ({ ...o, [key]: !o[key] }));
    if (pages) setStale(true);
  };

  const analyze = async () => {
    setLoadError(null);
    setPages(null);
    setStale(false);
    try {
      await loadPdfDoc(file);
      const doc = await getPdfJsDoc(file);
      const total = doc.numPages;
      const result = await run<PageBlocks>(total, (i) =>
        extractPage(doc, i + 1, opts)
      );
      if (result === null) {
        toast.info("Analysis cancelled.");
        return;
      }
      setPages(result);
      toast.success("Analysis complete. Review the preview below.");
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  const download = async () => {
    if (!pages) return;
    setBuilding(true);
    try {
      const blob = await buildDocx(pages);
      saveAs(blob, "converted.docx");
      toast.success("DOCX ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <ToolShell
      title="PDF to Word"
      description="Reconstruct a PDF's text, styling, lists, tables and images into an editable DOCX."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={(f) => {
          setFiles(f);
          setPages(null);
          setLoadError(null);
        }}
        hint="Select a single PDF file"
      />

      {!file && (
        <EmptyState>Choose a PDF above to convert it to Word.</EmptyState>
      )}

      {loadError && <LoadError message={loadError} onRetry={startOver} />}

      {file && !loadError && (
        <>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Text, styling, lists, tables and images are reconstructed
              automatically. Very complex layouts may still need manual cleanup
              in Word.
            </span>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>Detection options</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={opts[o.key]}
                    onCheckedChange={() => toggle(o.key)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <ProcessButton
            onClick={analyze}
            loading={running}
            progress={progress}
          >
            {pages ? "Re-analyze PDF" : "Analyze PDF"}
          </ProcessButton>
          {running && (
            <Button variant="outline" className="w-full" onClick={cancel}>
              Cancel
            </Button>
          )}

          {pages && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold">Preview</h2>
                  {stale && (
                    <span className="text-xs text-amber-600">
                      options changed — re-analyze to refresh
                    </span>
                  )}
                </div>
                <div className="flex gap-2 max-sm:w-full">
                  <Button
                    onClick={download}
                    disabled={building}
                    className="max-sm:flex-1"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {building ? "Building…" : "Download .docx"}
                  </Button>
                  <Button variant="ghost" onClick={startOver}>
                    Start over
                  </Button>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-4 overflow-auto rounded-lg border p-4">
                {pages.map((pg) => (
                  <div key={pg.page} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Page {pg.page} · {Math.round(pg.widthPt)}×
                      {Math.round(pg.heightPt)}pt ·{" "}
                      {pg.landscape ? "landscape" : "portrait"}
                    </p>
                    {pg.blocks.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        (no detected content)
                      </p>
                    )}
                    {pg.blocks.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 border-l-2 pl-2"
                      >
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {blockTag(b)}
                        </Badge>
                        <span className="line-clamp-2 text-sm text-muted-foreground">
                          {blockText(b) || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </ToolShell>
  );
}

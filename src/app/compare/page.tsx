"use client";

import { useState } from "react";
import { diffWords, type Change } from "diff";
import pixelmatch from "pixelmatch";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useYieldingLoop } from "@/hooks/useYieldingLoop";
import { getPdfJsDoc, renderPageToCanvas, extractText } from "@/lib/pdf/render";
import { loadPdfDoc } from "@/lib/pdf/load";

interface PageResult {
  page: number;
  status: "changed" | "same" | "added" | "removed";
  origUrl?: string;
  modUrl?: string;
  diffUrl?: string;
  pctChanged?: number;
  resized?: boolean;
}

function canvasToThumb(canvas: HTMLCanvasElement, maxW = 260): string {
  const scale = Math.min(1, maxW / canvas.width);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(canvas, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.8);
}

function imageDataOf(canvas: HTMLCanvasElement): ImageData {
  return canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
}

// Draw a source canvas onto a fresh canvas of the given size (used to align
// differently-sized pages before pixel comparison).
function resizeCanvas(
  src: HTMLCanvasElement,
  w: number,
  h: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(src, 0, 0, w, h);
  return c;
}

export default function ComparePage() {
  const [origFiles, setOrigFiles] = useState<File[]>([]);
  const [modFiles, setModFiles] = useState<File[]>([]);
  const orig = origFiles[0];
  const mod = modFiles[0];
  const ready = !!orig && !!mod;

  // text diff
  const [textBusy, setTextBusy] = useState(false);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);

  // visual diff
  const [threshold, setThreshold] = useState(0.1);
  const [results, setResults] = useState<PageResult[] | null>(null);
  const { run, cancel, running, progress } = useYieldingLoop();

  const runTextDiff = async () => {
    setTextBusy(true);
    setChanges(null);
    try {
      await loadPdfDoc(orig);
      await loadPdfDoc(mod);
      const [a, b] = await Promise.all([extractText(orig), extractText(mod)]);
      setChanges(diffWords(a, b));
      toast.success("Text comparison ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTextBusy(false);
    }
  };

  const additions = changes
    ? changes.filter((c) => c.added).reduce((n, c) => n + (c.count ?? 0), 0)
    : 0;
  const deletions = changes
    ? changes.filter((c) => c.removed).reduce((n, c) => n + (c.count ?? 0), 0)
    : 0;

  const runVisualDiff = async () => {
    setResults(null);
    try {
      await loadPdfDoc(orig);
      await loadPdfDoc(mod);
      const [docA, docB] = await Promise.all([
        getPdfJsDoc(orig),
        getPdfJsDoc(mod),
      ]);
      const scale = 150 / 72;
      const total = Math.max(docA.numPages, docB.numPages);

      const out = await run<PageResult>(total, async (i) => {
        const pageNum = i + 1;
        const hasA = pageNum <= docA.numPages;
        const hasB = pageNum <= docB.numPages;

        if (hasA && !hasB) {
          const ca = await renderPageToCanvas(docA, pageNum, scale);
          const res: PageResult = {
            page: pageNum,
            status: "removed",
            origUrl: canvasToThumb(ca),
          };
          ca.width = 0;
          ca.height = 0;
          return res;
        }
        if (!hasA && hasB) {
          const cb = await renderPageToCanvas(docB, pageNum, scale);
          const res: PageResult = {
            page: pageNum,
            status: "added",
            modUrl: canvasToThumb(cb),
          };
          cb.width = 0;
          cb.height = 0;
          return res;
        }

        const ca = await renderPageToCanvas(docA, pageNum, scale);
        let cb = await renderPageToCanvas(docB, pageNum, scale);
        const resized = cb.width !== ca.width || cb.height !== ca.height;
        if (resized) cb = resizeCanvas(cb, ca.width, ca.height);

        const w = ca.width;
        const h = ca.height;
        const da = imageDataOf(ca);
        const db = imageDataOf(cb);
        const diff = new ImageData(w, h);
        const numDiff = pixelmatch(da.data, db.data, diff.data, w, h, {
          threshold,
          alpha: 0.5,
          diffColor: [255, 0, 255],
          includeAA: false,
        });
        const diffCanvas = document.createElement("canvas");
        diffCanvas.width = w;
        diffCanvas.height = h;
        diffCanvas.getContext("2d")!.putImageData(diff, 0, 0);

        const pct = (numDiff / (w * h)) * 100;
        const res: PageResult = {
          page: pageNum,
          status: numDiff === 0 ? "same" : "changed",
          origUrl: canvasToThumb(ca),
          modUrl: canvasToThumb(cb),
          diffUrl: canvasToThumb(diffCanvas),
          pctChanged: pct,
          resized,
        };
        ca.width = 0;
        ca.height = 0;
        cb.width = 0;
        cb.height = 0;
        diffCanvas.width = 0;
        diffCanvas.height = 0;
        return res;
      });

      if (out === null) {
        toast.info("Comparison cancelled.");
        return;
      }
      setResults(out);
      toast.success("Visual comparison ready.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const statusBadge = (status: PageResult["status"]) => {
    const map = {
      changed: { label: "Changed", cls: "bg-amber-500/15 text-amber-600" },
      same: { label: "Identical", cls: "bg-emerald-500/15 text-emerald-600" },
      added: { label: "Added", cls: "bg-emerald-500/15 text-emerald-600" },
      removed: { label: "Removed", cls: "bg-destructive/15 text-destructive" },
    } as const;
    const m = map[status];
    return <Badge className={m.cls}>{m.label}</Badge>;
  };

  return (
    <ToolShell
      title="Compare PDFs"
      description="Highlight text and visual changes between two files."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Original</Label>
          <FileDropzone
            accept={{ "application/pdf": [".pdf"] }}
            files={origFiles}
            onFilesChange={setOrigFiles}
            hint="The baseline PDF"
          />
        </div>
        <div className="space-y-2">
          <Label>Modified</Label>
          <FileDropzone
            accept={{ "application/pdf": [".pdf"] }}
            files={modFiles}
            onFilesChange={setModFiles}
            hint="The changed PDF"
          />
        </div>
      </div>

      {!ready && (
        <EmptyState>Add both PDFs above to compare them.</EmptyState>
      )}

      {ready && (
        <Tabs defaultValue="text" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="text">Text diff</TabsTrigger>
            <TabsTrigger value="visual">Visual overlay</TabsTrigger>
          </TabsList>

          {/* MODE 1 */}
          <TabsContent value="text" className="space-y-4">
            <ProcessButton onClick={runTextDiff} loading={textBusy}>
              Compare text
            </ProcessButton>

            {changes && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div className="flex gap-4">
                    <span className="font-medium text-emerald-600">
                      {additions} addition{additions === 1 ? "" : "s"}
                    </span>
                    <span className="font-medium text-destructive">
                      {deletions} deletion{deletions === 1 ? "" : "s"}
                    </span>
                  </div>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={changesOnly}
                      onCheckedChange={(v) => setChangesOnly(v === true)}
                    />
                    Changes only
                  </label>
                </div>

                <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-md border p-4 text-sm leading-relaxed">
                  {additions === 0 && deletions === 0 ? (
                    <span className="text-muted-foreground">
                      No text differences found.
                    </span>
                  ) : (
                    changes.map((c, i) => {
                      if (c.added)
                        return (
                          <span
                            key={i}
                            className="rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          >
                            {c.value}
                          </span>
                        );
                      if (c.removed)
                        return (
                          <span
                            key={i}
                            className="rounded bg-destructive/20 text-destructive line-through"
                          >
                            {c.value}
                          </span>
                        );
                      if (changesOnly) return null;
                      return <span key={i}>{c.value}</span>;
                    })
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* MODE 2 */}
          <TabsContent value="visual" className="space-y-4">
            <div className="space-y-2">
              <Label>Match threshold: {threshold.toFixed(2)}</Label>
              <Slider
                min={0}
                max={0.3}
                step={0.01}
                value={[threshold]}
                onValueChange={(v) =>
                  setThreshold(Array.isArray(v) ? v[0] : v)
                }
              />
              <p className="text-xs text-muted-foreground">
                Lower is stricter (flags smaller differences).
              </p>
            </div>

            <ProcessButton
              onClick={runVisualDiff}
              loading={running}
              progress={progress}
            >
              Compare pages
            </ProcessButton>
            {running && (
              <Button variant="outline" className="w-full" onClick={cancel}>
                Cancel
              </Button>
            )}

            {results && (
              <div className="space-y-4">
                {results.map((r) => (
                  <div key={r.page} className="space-y-2 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Page {r.page}</span>
                      {statusBadge(r.status)}
                      {r.pctChanged !== undefined && r.status !== "same" && (
                        <span className="text-sm text-muted-foreground">
                          {r.pctChanged.toFixed(2)}% pixels changed
                        </span>
                      )}
                      {r.resized && (
                        <span className="text-xs text-amber-600">
                          modified page scaled to match original size
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <ThumbCell label="Original" url={r.origUrl} />
                      <ThumbCell label="Modified" url={r.modUrl} />
                      <ThumbCell label="Diff" url={r.diffUrl} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </ToolShell>
  );
}

function ThumbCell({ label, url }: { label: string; url?: string }) {
  return (
    <div className="space-y-1 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="mx-auto h-auto w-full rounded border" />
      ) : (
        <div className="flex h-32 items-center justify-center rounded border text-xs text-muted-foreground">
          —
        </div>
      )}
    </div>
  );
}

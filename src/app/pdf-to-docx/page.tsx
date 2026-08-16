"use client";

import { useState } from "react";
import { Document, Packer, Paragraph, TextRun } from "docx";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useYieldingLoop } from "@/hooks/useYieldingLoop";
import { getPdfJsDoc } from "@/lib/pdf/render";
import { loadPdfDoc } from "@/lib/pdf/load";

interface TItem {
  str: string;
  transform: number[];
  height: number;
}

interface Line {
  y: number;
  text: string;
  height: number;
}

const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function reconstructLines(items: TItem[]): Line[] {
  const entries = items
    .filter((it) => it.str.trim() !== "")
    .map((it) => ({
      x: it.transform[4],
      y: it.transform[5],
      h: it.height || Math.abs(it.transform[3]) || 10,
      str: it.str,
    }));
  if (entries.length === 0) return [];

  entries.sort((a, b) => b.y - a.y); // top of page first

  const clusters: { y: number; items: typeof entries }[] = [];
  for (const e of entries) {
    const last = clusters[clusters.length - 1];
    const tol = Math.max(2, e.h * 0.5);
    if (last && Math.abs(last.y - e.y) <= tol) {
      last.items.push(e);
    } else {
      clusters.push({ y: e.y, items: [e] });
    }
  }

  return clusters
    .map((c) => {
      c.items.sort((a, b) => a.x - b.x);
      const text = c.items
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return { y: c.y, text, height: median(c.items.map((i) => i.h)) };
    })
    .filter((l) => l.text.length > 0);
}

export default function PdfToDocxPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];

  const [mode, setMode] = useState<"lines" | "paragraphs">("paragraphs");
  const [fontScale, setFontScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const { run, cancel, running, progress } = useYieldingLoop();

  const startOver = () => setFiles([]);

  const sizeHalfPts = (heightPts: number, headingBoost = 1) => {
    const pt = Math.min(96, Math.max(6, Math.round(heightPts * fontScale * headingBoost)));
    return pt * 2; // docx sizes are in half-points
  };

  const handleConvert = async () => {
    setLoadError(null);
    try {
      await loadPdfDoc(file);
      const doc = await getPdfJsDoc(file);
      const total = doc.numPages;

      const perPage = await run<Paragraph[]>(total, async (i) => {
        const page = await doc.getPage(i + 1);
        const content = await page.getTextContent();
        const items = content.items.filter(
          (it) => "str" in it && "transform" in it
        ) as unknown as TItem[];
        const lines = reconstructLines(items);
        if (lines.length === 0) return [];

        const medianHeight = median(lines.map((l) => l.height));
        const gaps: number[] = [];
        for (let k = 1; k < lines.length; k++) {
          gaps.push(lines[k - 1].y - lines[k].y);
        }
        const medianGap = median(gaps) || medianHeight * 1.2;

        const isHeading = (l: Line) => l.height > medianHeight * 1.35;
        const paras: Paragraph[] = [];

        if (mode === "lines") {
          lines.forEach((l, k) => {
            const gapBefore = k > 0 ? lines[k - 1].y - l.y : 0;
            const bigGap = gapBefore > medianGap * 1.5;
            const heading = isHeading(l);
            paras.push(
              new Paragraph({
                spacing: { after: bigGap ? 160 : 40 },
                children: [
                  new TextRun({
                    text: l.text,
                    bold: heading,
                    size: sizeHalfPts(l.height, heading ? 1.3 : 1),
                  }),
                ],
              })
            );
          });
        } else {
          // merge lines into paragraphs, breaking on big vertical gaps / headings
          let buf: Line[] = [];
          const flush = () => {
            if (buf.length === 0) return;
            const h = median(buf.map((l) => l.height));
            paras.push(
              new Paragraph({
                spacing: { after: 160 },
                children: [
                  new TextRun({
                    text: buf.map((l) => l.text).join(" "),
                    size: sizeHalfPts(h),
                  }),
                ],
              })
            );
            buf = [];
          };
          lines.forEach((l, k) => {
            const gapBefore = k > 0 ? lines[k - 1].y - l.y : 0;
            const bigGap = gapBefore > medianGap * 1.5;
            if (isHeading(l)) {
              flush();
              paras.push(
                new Paragraph({
                  spacing: { after: 120, before: 120 },
                  children: [
                    new TextRun({
                      text: l.text,
                      bold: true,
                      size: sizeHalfPts(l.height, 1.3),
                    }),
                  ],
                })
              );
              return;
            }
            if (bigGap) flush();
            buf.push(l);
          });
          flush();
        }

        return paras;
      });

      if (perPage === null) {
        toast.info("Conversion cancelled.");
        return;
      }

      const sections = perPage.map((children) => ({
        children: children.length > 0 ? children : [new Paragraph("")],
      }));
      const document = new Document({ sections });
      const blob = await Packer.toBlob(document);
      saveAs(blob, "converted.docx");
      toast.success("DOCX ready.");
    } catch (err) {
      setLoadError((err as Error).message);
    }
  };

  return (
    <ToolShell
      title="PDF to Word"
      description="Export the text of a PDF to an editable DOCX document."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
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
              Text and basic structure are preserved; complex layouts, columns
              and exact positioning may not carry over.
            </span>
          </div>

          <div className="space-y-2">
            <Label>Line handling</Label>
            <Tabs
              value={mode}
              onValueChange={(v) => v && setMode(v as "lines" | "paragraphs")}
            >
              <TabsList>
                <TabsTrigger value="paragraphs">
                  Merge into paragraphs
                </TabsTrigger>
                <TabsTrigger value="lines">Keep line breaks</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>Font size scale: {fontScale.toFixed(2)}×</Label>
            <Slider
              min={0.5}
              max={2}
              step={0.05}
              value={[fontScale]}
              onValueChange={(v) => setFontScale(Array.isArray(v) ? v[0] : v)}
            />
          </div>

          <ProcessButton
            onClick={handleConvert}
            loading={running}
            progress={progress}
          >
            <Download className="mr-2 h-4 w-4" />
            Convert to DOCX
          </ProcessButton>
          {running && (
            <Button variant="outline" className="w-full" onClick={cancel}>
              Cancel
            </Button>
          )}
        </>
      )}
    </ToolShell>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import type { Worker } from "tesseract.js";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { AlertCircle, Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { EmptyState } from "@/components/EmptyState";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { getPdfJsDoc, renderPageToCanvas } from "@/lib/pdf/render";
import { loadPdfDoc } from "@/lib/pdf/load";
import { downloadBytes } from "@/lib/download";

const LANGS: { code: string; label: string }[] = [
  { code: "eng", label: "English" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "ita", label: "Italian" },
  { code: "por", label: "Portuguese" },
  { code: "nld", label: "Dutch" },
  { code: "bul", label: "Bulgarian" },
];

interface PageResult {
  page: number;
  thumbUrl: string;
  text: string;
  pdf: number[] | null;
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

export default function OcrPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];

  const [langs, setLangs] = useState<Set<string>>(new Set(["eng"]));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<PageResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const cancelRef = useRef(false);
  const pageRef = useRef(0);
  const totalRef = useRef(1);

  useEffect(() => {
    setResults(null);
    setError(null);
    setProgress(0);
  }, [file]);

  // terminate worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const toggleLang = (code: string) => {
    setLangs((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const isPdf = file?.type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "");

  async function buildInputs(): Promise<
    { thumbUrl: string; image: HTMLCanvasElement | HTMLImageElement }[]
  > {
    if (isPdf) {
      await loadPdfDoc(file);
      const doc = await getPdfJsDoc(file);
      const scale = 300 / 72;
      const inputs: { thumbUrl: string; image: HTMLCanvasElement }[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const canvas = await renderPageToCanvas(doc, i, scale);
        inputs.push({ thumbUrl: canvasToThumb(canvas), image: canvas });
      }
      return inputs;
    }
    // image file
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read "${file.name}".`));
      el.src = url;
    });
    return [{ thumbUrl: url, image: img }];
  }

  const runOcr = async () => {
    if (langs.size === 0) {
      setError("Select at least one language.");
      return;
    }
    setError(null);
    setResults(null);
    setRunning(true);
    setProgress(0);
    setStatus("Preparing…");
    cancelRef.current = false;

    try {
      const inputs = await buildInputs();
      totalRef.current = inputs.length;

      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker([...langs].join("+"), 1, {
        logger: (m) => {
          if (typeof m.progress === "number" && m.status) {
            setStatus(m.status);
            const overall =
              ((pageRef.current + m.progress) / totalRef.current) * 100;
            setProgress(Math.min(100, Math.round(overall)));
          }
        },
      });
      workerRef.current = worker;

      const collected: PageResult[] = [];
      for (let i = 0; i < inputs.length; i++) {
        if (cancelRef.current) break;
        pageRef.current = i;
        const { data } = await worker.recognize(
          inputs[i].image,
          {},
          { text: true, pdf: true }
        );
        collected.push({
          page: i + 1,
          thumbUrl: inputs[i].thumbUrl,
          text: data.text,
          pdf: data.pdf,
        });
        // free the page canvas
        if (inputs[i].image instanceof HTMLCanvasElement) {
          const c = inputs[i].image as HTMLCanvasElement;
          c.width = 0;
          c.height = 0;
        }
      }

      await worker.terminate();
      workerRef.current = null;

      if (cancelRef.current) {
        toast.info("OCR cancelled.");
        return;
      }
      setResults(collected);
      toast.success(`Recognized ${collected.length} page${collected.length === 1 ? "" : "s"}.`);
    } catch (err) {
      if (cancelRef.current) {
        toast.info("OCR cancelled.");
      } else {
        setError((err as Error).message || "OCR failed. Please try again.");
      }
    } finally {
      if (workerRef.current) {
        await workerRef.current.terminate();
        workerRef.current = null;
      }
      setRunning(false);
      setStatus("");
    }
  };

  const handleCancel = () => {
    cancelRef.current = true;
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  const editText = (page: number, text: string) => {
    setResults((prev) =>
      prev ? prev.map((r) => (r.page === page ? { ...r, text } : r)) : prev
    );
  };

  const allText = () => (results ?? []).map((r) => r.text).join("\n\f\n");

  const downloadTxt = () => {
    const blob = new Blob([allText()], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "ocr-text.txt");
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(allText());
      toast.success("Copied all text.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const downloadSearchable = async () => {
    try {
      const pages = (results ?? []).filter((r) => r.pdf && r.pdf.length);
      if (pages.length === 0) throw new Error("No searchable PDF data available.");
      const out = await PDFDocument.create();
      for (const r of pages) {
        const src = await PDFDocument.load(Uint8Array.from(r.pdf!));
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach((p) => out.addPage(p));
      }
      const bytes = await out.save();
      downloadBytes(bytes, "ocr-searchable.pdf");
      toast.success("Searchable PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <ToolShell
      title="OCR Scanner"
      description="Recognize text in scanned PDFs and images, entirely in your browser."
    >
      <FileDropzone
        accept={{
          "application/pdf": [".pdf"],
          "image/png": [".png"],
          "image/jpeg": [".jpg", ".jpeg"],
        }}
        files={files}
        onFilesChange={setFiles}
        hint="A scanned PDF or an image (PNG/JPG)"
      />

      {!file && (
        <EmptyState>Choose a scanned PDF or image to extract its text.</EmptyState>
      )}

      {file && (
        <>
          <div className="space-y-3 rounded-lg border p-4">
            <Label>Languages</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {LANGS.map((l) => (
                <label
                  key={l.code}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={langs.has(l.code)}
                    onCheckedChange={() => toggleLang(l.code)}
                  />
                  {l.label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Language data (~10–15 MB each) downloads from the CDN on first use
              and is cached by your browser for next time.
            </p>
          </div>

          <ProcessButton
            onClick={runOcr}
            loading={running}
            disabled={langs.size === 0}
          >
            Run OCR
          </ProcessButton>

          {running && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm capitalize text-muted-foreground">
                  {status} — {progress}%
                </p>
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="space-y-2 rounded-md border border-destructive/50 bg-destructive/10 p-4">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertCircle className="h-4 w-4" />
                OCR could not be completed
              </div>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          )}

          {results && results.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button onClick={downloadSearchable} className="max-sm:w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Download searchable PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={downloadTxt}
                  className="max-sm:w-full"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download .txt
                </Button>
                <Button
                  variant="outline"
                  onClick={copyAll}
                  className="max-sm:w-full"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy all text
                </Button>
              </div>

              <div className="space-y-4">
                {results.map((r) => (
                  <div
                    key={r.page}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[200px_1fr]"
                  >
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">
                        Page {r.page}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.thumbUrl}
                        alt={`Page ${r.page}`}
                        className="w-full rounded border"
                      />
                    </div>
                    <textarea
                      value={r.text}
                      onChange={(e) => editText(r.page, e.target.value)}
                      className="min-h-40 w-full resize-y rounded-md border bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
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

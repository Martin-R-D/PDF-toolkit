"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileToBytes } from "./load";
import { runYieldingLoop } from "@/hooks/useYieldingLoop";

async function getLib() {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjsLib;
}

export async function getPdfJsDoc(file: File): Promise<PDFDocumentProxy> {
  const pdfjsLib = await getLib();
  const bytes = await fileToBytes(file);
  return pdfjsLib.getDocument({ data: bytes.slice() }).promise;
}

export async function renderPageToCanvas(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  scale: number
): Promise<HTMLCanvasElement> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

export async function renderPageToDataUrl(
  pdfDoc: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  type: "image/png" | "image/jpeg" = "image/png",
  quality = 0.92
): Promise<string> {
  const canvas = await renderPageToCanvas(pdfDoc, pageNumber, scale);
  return canvas.toDataURL(type, quality);
}

export async function generateThumbnails(
  file: File,
  scale = 0.3,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<string[]> {
  const doc = await getPdfJsDoc(file);
  const total = doc.numPages;
  if (total === 0) throw new Error("This PDF has no pages.");

  return runYieldingLoop(
    total,
    (i) => renderPageToDataUrl(doc, i + 1, scale),
    { signal, onProgress }
  );
}

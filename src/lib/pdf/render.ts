"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileToBytes } from "./load";

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
  onProgress?: (done: number, total: number) => void
): Promise<string[]> {
  const doc = await getPdfJsDoc(file);
  const total = doc.numPages;
  const thumbs: string[] = [];

  for (let i = 1; i <= total; i++) {
    const dataUrl = await renderPageToDataUrl(doc, i, scale);
    thumbs.push(dataUrl);
    onProgress?.(i, total);
    await new Promise((r) => setTimeout(r, 0));
  }

  return thumbs;
}

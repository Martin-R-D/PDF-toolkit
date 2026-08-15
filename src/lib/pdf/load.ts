import { PDFDocument } from "pdf-lib";

export const MAX_FILE_MB = 100;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export function assertFileSize(file: File) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `"${file.name}" is larger than ${MAX_FILE_MB} MB. This app processes files in your browser, so very large files aren't supported.`
    );
  }
}

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function loadPdfDoc(file: File): Promise<PDFDocument> {
  assertFileSize(file);
  const bytes = await fileToBytes(file);
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error(
      `Could not read "${file.name}". It may be corrupt or password-protected.`
    );
  }
  if (doc.getPageCount() === 0) {
    throw new Error(`"${file.name}" has no pages.`);
  }
  return doc;
}

export async function getPageCount(file: File): Promise<number> {
  const doc = await loadPdfDoc(file);
  return doc.getPageCount();
}

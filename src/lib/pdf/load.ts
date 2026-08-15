import { PDFDocument } from "pdf-lib";

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function loadPdfDoc(file: File): Promise<PDFDocument> {
  const bytes = await fileToBytes(file);
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    throw new Error(
      `Could not read "${file.name}". It may be corrupt or password-protected.`
    );
  }
}

export async function getPageCount(file: File): Promise<number> {
  const doc = await loadPdfDoc(file);
  return doc.getPageCount();
}

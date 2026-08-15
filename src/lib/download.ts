import { saveAs } from "file-saver";
import JSZip from "jszip";

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  saveAs(blob, filename);
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export async function downloadZip(
  files: { name: string; data: Uint8Array | Blob | string }[],
  zipName: string
) {
  const zip = new JSZip();

  for (const file of files) {
    if (typeof file.data === "string") {
      const base64 = file.data.replace(/^data:[^;]+;base64,/, "");
      zip.file(file.name, base64, { base64: true });
    } else {
      zip.file(file.name, file.data);
    }
  }

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, zipName);
}

import { copyFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const dest = resolve(root, "public/pdf.worker.min.mjs");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied pdf.worker.min.mjs to public/");

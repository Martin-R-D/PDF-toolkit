import { deflateSync } from "zlib";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- tiny PNG encoder (8-bit RGBA truecolor) ---
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [15, 23, 42]; // slate-900
const ACCENT = [129, 140, 248]; // indigo-400
const WHITE = [255, 255, 255];

function make(width, height) {
  const buf = new Uint8Array(width * height * 4);
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  };
  // background
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) set(x, y, BG);

  // centered white "document" with a folded corner + accent bars
  const s = Math.min(width, height);
  const docW = s * 0.42;
  const docH = s * 0.52;
  const x0 = (width - docW) / 2;
  const y0 = (height - docH) / 2;
  const fold = docW * 0.28;
  for (let y = Math.floor(y0); y < y0 + docH; y++) {
    for (let x = Math.floor(x0); x < x0 + docW; x++) {
      // cut the top-right fold triangle
      if (x - x0 > docW - fold && y - y0 < fold - (x - (x0 + docW - fold)))
        continue;
      set(x, y, WHITE);
    }
  }
  // accent text lines on the document
  const lineH = Math.max(2, s * 0.02);
  for (let n = 0; n < 3; n++) {
    const ly = y0 + docH * (0.42 + n * 0.16);
    for (let y = ly; y < ly + lineH; y++)
      for (let x = x0 + docW * 0.16; x < x0 + docW * 0.84; x++)
        set(Math.floor(x), Math.floor(y), ACCENT);
  }
  return encodePng(width, height, buf);
}

const outputs = [
  ["public/icon-192.png", 192, 192],
  ["public/icon-512.png", 512, 512],
  ["public/og-image.png", 1200, 630],
  ["public/apple-icon.png", 180, 180],
];

for (const [rel, w, h] of outputs) {
  writeFileSync(resolve(root, rel), make(w, h));
  console.log("wrote", rel);
}

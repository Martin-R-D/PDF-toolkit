/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { fileToBytes } from "@/lib/pdf/load";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunSpec {
  text: string;
  bold: boolean;
  italic: boolean;
  font: string;
  size: number; // points
  link?: string;
}

export interface ParagraphBlock {
  kind: "paragraph";
  runs: RunSpec[];
  heading?: 1 | 2 | 3;
  align?: "left" | "center" | "right" | "justified";
  indentPt?: number;
  list?: { type: "bullet" | "number"; level: number };
  y: number;
}

export interface ImageBlock {
  kind: "image";
  png: Uint8Array;
  widthPt: number;
  heightPt: number;
  y: number;
}

export interface TableBlock {
  kind: "table";
  rows: string[][];
  colWidths: number[];
  y: number;
}

export type Block = ParagraphBlock | ImageBlock | TableBlock;

export interface PageBlocks {
  page: number;
  blocks: Block[];
  widthPt: number;
  heightPt: number;
  landscape: boolean;
  margin: { top: number; right: number; bottom: number; left: number };
}

export interface ExtractOptions {
  mergeParagraphs: boolean;
  detectHeadings: boolean;
  detectLists: boolean;
  detectTables: boolean;
  detectColumns: boolean;
  includeImages: boolean;
  preserveHyperlinks: boolean;
}

// ---------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------

interface DItem {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  font: string;
  str: string;
}

interface Line {
  y: number;
  items: DItem[];
  fontSize: number;
  leftX: number;
  rightX: number;
}

interface LinkRect {
  url: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const median = (arr: number[]) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const BULLET_RE = /^[•◦▪‣⁃*–-]\s+/;
const NUMBER_RE = /^(\d+|[a-z]|[ivx]+)[.)]\s+/i;

function mapFontFamily(family: string | undefined, fontName: string): string {
  const raw = (family || fontName || "").replace(/^[A-Z]{6}\+/, "");
  const l = raw.toLowerCase();
  if (l.includes("times")) return "Times New Roman";
  if (l.includes("georgia")) return "Georgia";
  if (l.includes("courier") || l.includes("mono")) return "Courier New";
  if (l.includes("arial") || l.includes("helvetica")) return "Arial";
  if (l.includes("calibri")) return "Calibri";
  if (l.includes("verdana")) return "Verdana";
  if (l.includes("garamond")) return "Garamond";
  const base = raw.split(/[-,]/)[0].trim();
  return base || "Arial";
}

function isBold(fontName: string, weight: number | undefined) {
  if (typeof weight === "number" && weight >= 600) return true;
  return /bold|black|heavy|semibold|[-,]bd/i.test(fontName);
}

function isItalic(fontName: string) {
  return /italic|oblique|[-,]it/i.test(fontName);
}

// pdfjs-style 2x3 matrix multiply: result applies `t` then `m`.
function mul(m: number[], t: number[]): number[] {
  return [
    m[0] * t[0] + m[2] * t[1],
    m[1] * t[0] + m[3] * t[1],
    m[0] * t[2] + m[2] * t[3],
    m[1] * t[2] + m[3] * t[3],
    m[0] * t[4] + m[2] * t[5] + m[4],
    m[1] * t[4] + m[3] * t[5] + m[5],
  ];
}

// ---------------------------------------------------------------------------
// Line reconstruction
// ---------------------------------------------------------------------------

function buildLines(items: DItem[]): Line[] {
  if (items.length === 0) return [];
  const medSize = median(items.map((i) => i.fontSize)) || 10;
  const tol = Math.max(1, medSize * 0.5);

  const sorted = [...items].sort((a, b) => b.y - a.y);
  const clusters: DItem[][] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= tol) last.push(it);
    else clusters.push([it]);
  }

  return clusters
    .map((c) => {
      c.sort((a, b) => a.x - b.x);
      const fontSize = median(c.map((i) => i.fontSize));
      const leftX = Math.min(...c.map((i) => i.x));
      const rightX = Math.max(...c.map((i) => i.x + i.w));
      return { y: c[0].y, items: c, fontSize, leftX, rightX };
    })
    .filter((l) => l.items.some((i) => i.str.trim() !== ""));
}

function linkForItem(it: DItem, links: LinkRect[]): string | undefined {
  for (const lk of links) {
    if (
      it.x + it.w / 2 >= lk.x1 &&
      it.x + it.w / 2 <= lk.x2 &&
      it.y >= lk.y1 - 2 &&
      it.y <= lk.y2 + 2
    ) {
      return lk.url;
    }
  }
  return undefined;
}

// Turn a line's items into styled runs, inserting spaces only across real gaps.
function lineToRuns(line: Line, links: LinkRect[]): RunSpec[] {
  const runs: RunSpec[] = [];
  let prev: DItem | null = null;
  for (const it of line.items) {
    if (it.str === "") {
      prev = it;
      continue;
    }
    const link = linkForItem(it, links);
    let text = it.str;
    if (prev) {
      const gap = it.x - (prev.x + prev.w);
      const needSpace =
        gap > it.fontSize * 0.25 &&
        !prev.str.endsWith(" ") &&
        !it.str.startsWith(" ");
      if (needSpace) text = " " + text;
    }
    const last = runs[runs.length - 1];
    if (
      last &&
      last.bold === isBoldFlag(it) &&
      last.italic === it.italic &&
      last.font === it.font &&
      Math.round(last.size) === Math.round(it.fontSize) &&
      last.link === link
    ) {
      last.text += text;
    } else {
      runs.push({
        text,
        bold: it.bold,
        italic: it.italic,
        font: it.font,
        size: it.fontSize,
        link,
      });
    }
    prev = it;
  }
  return runs.filter((r) => r.text.trim() !== "" || r.text.includes(" "));
}

const isBoldFlag = (it: DItem) => it.bold;

// ---------------------------------------------------------------------------
// Table detection
// ---------------------------------------------------------------------------

interface TableCandidate {
  start: number;
  end: number;
  rows: string[][];
  colWidths: number[];
  y: number;
}

function detectTables(lines: Line[]): TableCandidate[] {
  const tol = 4;
  // cluster all item left-x across the page
  const xs = lines.flatMap((l) => l.items.map((i) => i.x)).sort((a, b) => a - b);
  const centers: number[] = [];
  for (const x of xs) {
    const last = centers[centers.length - 1];
    if (last === undefined || x - last > tol) centers.push(x);
  }

  const clusterOf = (x: number) => {
    for (let c = 0; c < centers.length; c++) {
      if (Math.abs(x - centers[c]) <= tol) return c;
    }
    return -1;
  };

  const lineClusters = lines.map((l) => {
    const set = new Set<number>();
    for (const it of l.items) {
      const c = clusterOf(it.x);
      if (c >= 0) set.add(c);
    }
    return set;
  });

  const candidates: TableCandidate[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lineClusters[i].size < 2) {
      i++;
      continue;
    }
    let j = i;
    const colUnion = new Set<number>();
    while (j < lines.length && lineClusters[j].size >= 2) {
      lineClusters[j].forEach((c) => colUnion.add(c));
      j++;
    }
    const rowCount = j - i;
    const cols = [...colUnion].sort((a, b) => a - b);
    if (rowCount >= 3 && cols.length >= 2) {
      const rows: string[][] = [];
      for (let r = i; r < j; r++) {
        const cells: string[] = cols.map(() => "");
        for (const it of lines[r].items) {
          // assign item to the nearest column center <= its x
          let ci = 0;
          for (let k = 0; k < cols.length; k++) {
            if (it.x + tol >= centers[cols[k]]) ci = k;
          }
          cells[ci] = (cells[ci] ? cells[ci] + " " : "") + it.str;
        }
        rows.push(cells.map((c) => c.replace(/\s+/g, " ").trim()));
      }
      const colWidths = cols.map((c, k) => {
        const next = k + 1 < cols.length ? centers[cols[k + 1]] : centers[cols[k]] + 100;
        return Math.max(20, next - centers[c]);
      });
      candidates.push({ start: i, end: j - 1, rows, colWidths, y: lines[i].y });
    }
    i = j;
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function resolveObj(page: any, name: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (v: any) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      page.objs.get(name, finish);
    } catch {
      try {
        page.commonObjs.get(name, finish);
      } catch (e) {
        reject(e);
        return;
      }
    }
    setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("image object not ready"));
      }
    }, 2500);
  });
}

function imageToPng(img: any): Uint8Array | null {
  const w = img.width;
  const h = img.height;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else if (img.data) {
    const data: Uint8ClampedArray | Uint8Array = img.data;
    const out = new Uint8ClampedArray(w * h * 4);
    if (img.kind === 3 && data.length >= w * h * 4) {
      out.set(data.subarray(0, w * h * 4));
    } else if (data.length >= w * h * 3) {
      // RGB_24BPP -> RGBA
      for (let p = 0, q = 0; p < w * h; p++, q += 3) {
        out[p * 4] = data[q];
        out[p * 4 + 1] = data[q + 1];
        out[p * 4 + 2] = data[q + 2];
        out[p * 4 + 3] = 255;
      }
    } else {
      return null;
    }
    ctx.putImageData(new ImageData(out, w, h), 0, 0);
  } else {
    return null;
  }

  const url = canvas.toDataURL("image/png");
  const b64 = url.split(",")[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  return bytes;
}

async function extractImages(page: any, OPS: any): Promise<ImageBlock[]> {
  const opList = await page.getOperatorList();
  const out: ImageBlock[] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack: number[][] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as number[]);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      try {
        const name = args[0];
        const img = await resolveObj(page, name);
        const png = imageToPng(img);
        if (!png) continue;
        const widthPt = Math.hypot(ctm[0], ctm[1]);
        const heightPt = Math.hypot(ctm[2], ctm[3]);
        out.push({
          kind: "image",
          png,
          widthPt,
          heightPt,
          y: ctm[5] + heightPt,
        });
      } catch {
        // skip this image, keep going
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structure classification for a single line
// ---------------------------------------------------------------------------

function classifyLine(
  line: Line,
  opts: ExtractOptions,
  medSize: number,
  contentLeft: number,
  contentRight: number
) {
  const text = line.items
    .map((i) => i.str)
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  let heading: 1 | 2 | 3 | undefined;
  if (opts.detectHeadings && medSize > 0) {
    const ratio = line.fontSize / medSize;
    if (ratio >= 1.8) heading = 1;
    else if (ratio >= 1.45) heading = 2;
    else if (ratio >= 1.2) heading = 3;
  }

  let list: { type: "bullet" | "number"; level: number } | undefined;
  let stripped = text;
  if (opts.detectLists && !heading) {
    if (BULLET_RE.test(text)) {
      list = { type: "bullet", level: 0 };
      stripped = text.replace(BULLET_RE, "");
    } else if (NUMBER_RE.test(text)) {
      list = { type: "number", level: 0 };
      stripped = text.replace(NUMBER_RE, "");
    }
  }

  // alignment
  const contentWidth = contentRight - contentLeft;
  const centerPage = (contentLeft + contentRight) / 2;
  const centerLine = (line.leftX + line.rightX) / 2;
  let align: ParagraphBlock["align"] | undefined;
  const near = contentWidth * 0.05;
  const leftNear = line.leftX <= contentLeft + near;
  const rightNear = line.rightX >= contentRight - near;
  if (leftNear && rightNear) align = "justified";
  else if (Math.abs(centerLine - centerPage) <= near && !leftNear) align = "center";
  else if (rightNear && line.leftX > contentLeft + contentWidth * 0.25)
    align = "right";
  else align = "left";

  // indentation
  let indentPt: number | undefined;
  if (line.leftX > contentLeft + 18) indentPt = line.leftX - contentLeft;

  return { text, stripped, heading, list, align, indentPt };
}

// ---------------------------------------------------------------------------
// Main per-page extraction
// ---------------------------------------------------------------------------

export async function extractPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  opts: ExtractOptions
): Promise<PageBlocks> {
  const pdfjs = await import("pdfjs-dist");
  const OPS = (pdfjs as any).OPS;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const widthPt = viewport.width;
  const heightPt = viewport.height;

  const tc = await page.getTextContent({ includeMarkedContent: false });
  const styles = tc.styles as Record<string, any>;

  const rawItems = tc.items.filter(
    (it: any) => "str" in it && "transform" in it
  ) as any[];

  const items: DItem[] = rawItems
    .filter((it) => it.str !== "")
    .map((it) => {
      const t = it.transform as number[];
      const style = styles[it.fontName] || {};
      const font = mapFontFamily(style.fontFamily, it.fontName);
      return {
        x: t[4],
        y: t[5],
        w: it.width,
        h: it.height,
        fontSize: Math.round(Math.hypot(t[2], t[3]) * 10) / 10,
        bold: isBold(it.fontName, style.fontWeight),
        italic: isItalic(it.fontName),
        font,
        str: it.str,
      };
    })
    .filter((d) => d.str.trim() !== "");

  // hyperlinks
  let links: LinkRect[] = [];
  if (opts.preserveHyperlinks) {
    try {
      const annots = await page.getAnnotations();
      links = annots
        .filter((a: any) => a.subtype === "Link" && a.url)
        .map((a: any) => ({
          url: a.url as string,
          x1: Math.min(a.rect[0], a.rect[2]),
          y1: Math.min(a.rect[1], a.rect[3]),
          x2: Math.max(a.rect[0], a.rect[2]),
          y2: Math.max(a.rect[1], a.rect[3]),
        }));
    } catch {
      links = [];
    }
  }

  // margins from content bounds
  const contentLeft = items.length ? Math.min(...items.map((i) => i.x)) : 72;
  const contentRight = items.length
    ? Math.max(...items.map((i) => i.x + i.w))
    : widthPt - 72;
  const contentTop = items.length ? Math.max(...items.map((i) => i.y)) : heightPt - 72;
  const contentBottom = items.length ? Math.min(...items.map((i) => i.y)) : 72;
  const clampMargin = (v: number) => Math.min(108, Math.max(28.8, v));
  const margin = {
    left: clampMargin(contentLeft),
    right: clampMargin(widthPt - contentRight),
    top: clampMargin(heightPt - contentTop),
    bottom: clampMargin(contentBottom),
  };

  // group items into reading order (columns or plain)
  const groups: DItem[][] = [];
  if (opts.detectColumns) {
    const cols = detectColumns(items, widthPt);
    if (cols) groups.push(...cols);
    else groups.push(items);
  } else {
    groups.push(items);
  }

  const medSize =
    median(items.map((i) => i.fontSize)) || 10;

  const paraAndTableBlocks: Block[] = [];

  for (const group of groups) {
    const lines = buildLines(group);
    if (lines.length === 0) continue;

    // table detection
    const consumed = new Set<number>();
    if (opts.detectTables) {
      try {
        const tables = detectTables(lines);
        for (const t of tables) {
          paraAndTableBlocks.push({
            kind: "table",
            rows: t.rows,
            colWidths: t.colWidths,
            y: t.y,
          });
          for (let r = t.start; r <= t.end; r++) consumed.add(r);
        }
      } catch {
        // ignore table detection failure
      }
    }

    // line gaps for paragraph breaks
    const gaps: number[] = [];
    for (let k = 1; k < lines.length; k++) gaps.push(lines[k - 1].y - lines[k].y);
    const medGap = median(gaps) || medSize * 1.2;

    let current: ParagraphBlock | null = null;
    const flush = () => {
      if (current && current.runs.length) paraAndTableBlocks.push(current);
      current = null;
    };

    for (let k = 0; k < lines.length; k++) {
      if (consumed.has(k)) {
        flush();
        continue;
      }
      const line = lines[k];
      let info;
      try {
        info = classifyLine(line, opts, medSize, contentLeft, contentRight);
      } catch {
        info = {
          text: line.items.map((i) => i.str).join(""),
          stripped: line.items.map((i) => i.str).join(""),
          heading: undefined,
          list: undefined,
          align: "left" as const,
          indentPt: undefined,
        };
      }

      const runs = lineToRuns(line, links);
      if (runs.length === 0) {
        flush();
        continue;
      }
      // strip list marker from the first run's text
      if (info.list && runs.length) {
        runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s*/, "") };
        const stripRe = info.list.type === "bullet" ? BULLET_RE : NUMBER_RE;
        runs[0] = { ...runs[0], text: runs[0].text.replace(stripRe, "") };
      }

      const gapBefore = k > 0 ? lines[k - 1].y - line.y : 0;
      const bigGap = gapBefore > medGap * 1.5;
      const structural = !!info.heading || !!info.list;

      const startNew =
        !current ||
        !opts.mergeParagraphs ||
        bigGap ||
        structural ||
        (current && current.heading) ||
        (current && current.list && !info.list);

      if (startNew) {
        flush();
        current = {
          kind: "paragraph",
          runs: [...runs],
          heading: info.heading,
          align: info.align,
          indentPt: info.indentPt,
          list: info.list,
          y: line.y,
        };
        // headings and list items stay single-line unless merged continuation
        if (info.heading) flush();
      } else if (current) {
        current.runs.push({
          text: " ",
          bold: false,
          italic: false,
          font: runs[0].font,
          size: runs[0].size,
        });
        current.runs.push(...runs);
      }
    }
    flush();
  }

  // images
  let imageBlocks: ImageBlock[] = [];
  if (opts.includeImages) {
    try {
      imageBlocks = await extractImages(page, OPS);
    } catch {
      imageBlocks = [];
    }
  }

  const blocks = [...paraAndTableBlocks, ...imageBlocks].sort(
    (a, b) => b.y - a.y
  );

  return {
    page: pageNumber,
    blocks,
    widthPt,
    heightPt,
    landscape: widthPt > heightPt,
    margin,
  };
}

// Two-column detection: find a wide empty vertical band near the center that
// no item crosses. Returns [leftItems, rightItems] or null.
function detectColumns(items: DItem[], widthPt: number): DItem[][] | null {
  if (items.length < 20) return null;
  const centerLo = widthPt * 0.42;
  const centerHi = widthPt * 0.58;
  const crosses = items.some((i) => i.x < centerLo && i.x + i.w > centerHi);
  if (crosses) return null;
  const left = items.filter((i) => i.x + i.w / 2 < widthPt / 2);
  const right = items.filter((i) => i.x + i.w / 2 >= widthPt / 2);
  if (left.length < 5 || right.length < 5) return null;
  return [left, right];
}

// Convenience: load a File into a pdfjs doc handled elsewhere; extraction is
// driven page-by-page by the caller so it can yield between pages.
export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  const bytes = await fileToBytes(file);
  return bytes.buffer.slice(0) as ArrayBuffer;
}

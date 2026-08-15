"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  MousePointer2,
  Type,
  ImagePlus,
  Square,
  Circle,
  Minus,
  Highlighter,
  Eraser,
  SquareStop,
  PenTool,
  Undo2,
  Redo2,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { EmptyState } from "@/components/EmptyState";
import { LoadError } from "@/components/LoadError";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { loadPdfDoc, fileToBytes } from "@/lib/pdf/load";
import { getPdfJsDoc, renderPageToCanvas } from "@/lib/pdf/render";
import { downloadBytes } from "@/lib/download";
import {
  screenToPdf,
  pdfBoxToScreen,
  screenBoxToPdf,
  pdfToScreen,
  type ScreenBox,
} from "@/lib/editor/coords";

type Tool =
  | "select"
  | "text"
  | "image"
  | "rect"
  | "ellipse"
  | "line"
  | "highlight"
  | "whiteout"
  | "redact"
  | "pen";

type AnnType = Exclude<Tool, "select">;

interface Annotation {
  id: string;
  page: number;
  type: AnnType;
  // box types (rect/ellipse/highlight/whiteout/redact/image/text)
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  // line
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  // pen
  points?: { x: number; y: number }[];
  // style
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  opacity?: number;
  // text
  text?: string;
  fontKey?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  // image
  dataUrl?: string;
  imgKind?: "png" | "jpg";
}

interface View {
  scalePx: number; // screen px per pt
  wPx: number;
  hPx: number;
  hPts: number;
}

const BOX_TYPES: AnnType[] = [
  "rect",
  "ellipse",
  "highlight",
  "whiteout",
  "redact",
  "image",
  "text",
];

const FONT_CSS: Record<string, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  TimesRoman: "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

let idc = 0;
const uid = () => `a-${idc++}`;

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const s = m.length === 3 ? m.replace(/(.)/g, "$1$1") : m;
  return {
    r: parseInt(s.slice(0, 2), 16) / 255,
    g: parseInt(s.slice(2, 4), 16) / 255,
    b: parseInt(s.slice(4, 6), 16) / 255,
  };
}

function pdfFont(key: string, bold: boolean) {
  if (key === "TimesRoman")
    return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  if (key === "Courier")
    return bold ? StandardFonts.CourierBold : StandardFonts.Courier;
  return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
}

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
type Handle = (typeof HANDLES)[number];

const TOOLS: { tool: Tool; icon: typeof Square; label: string }[] = [
  { tool: "select", icon: MousePointer2, label: "Select" },
  { tool: "text", icon: Type, label: "Text" },
  { tool: "image", icon: ImagePlus, label: "Image" },
  { tool: "rect", icon: Square, label: "Rectangle" },
  { tool: "ellipse", icon: Circle, label: "Ellipse" },
  { tool: "line", icon: Minus, label: "Line" },
  { tool: "highlight", icon: Highlighter, label: "Highlight" },
  { tool: "whiteout", icon: Eraser, label: "Whiteout" },
  { tool: "redact", icon: SquareStop, label: "Redact" },
  { tool: "pen", icon: PenTool, label: "Free-draw" },
];

export default function EditorPage() {
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];

  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    | (ScreenBox & { kind: "box"; type: AnnType })
    | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
    | { kind: "pen"; pts: { x: number; y: number }[] }
    | null
  >(null);
  const [exporting, setExporting] = useState(false);

  // annotations history
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [hIndex, setHIndex] = useState(0);

  const [style, setStyle] = useState({
    stroke: "#e11d48",
    fill: "#ffffff",
    hasFill: false,
    strokeWidth: 2,
    opacity: 1,
    fontKey: "Helvetica",
    fontSize: 16,
    color: "#111827",
    bold: false,
  });

  const docRef = useRef<Awaited<ReturnType<typeof getPdfJsDoc>> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImgPt = useRef<{ lx: number; ly: number } | null>(null);
  const opRef = useRef<
    | null
    | { type: "draw"; tool: Tool; sx: number; sy: number }
    | { type: "pen"; pts: { x: number; y: number }[] }
    | { type: "move"; id: string; startClientX: number; startClientY: number; orig: Annotation }
    | {
        type: "resize";
        id: string;
        handle: Handle;
        startClientX: number;
        startClientY: number;
        origBox: ScreenBox;
        orig: Annotation;
      }
  >(null);

  const draftRef = useRef(draft);
  const annotationsRef = useRef(annotations);
  viewRef.current = view;
  draftRef.current = draft;
  annotationsRef.current = annotations;

  const commit = useCallback(
    (next: Annotation[]) => {
      setAnnotations(next);
      setHistory((h) => [...h.slice(0, hIndex + 1), next]);
      setHIndex((i) => i + 1);
    },
    [hIndex]
  );

  const undo = useCallback(() => {
    setHIndex((i) => {
      if (i <= 0) return i;
      setAnnotations(history[i - 1]);
      setSelectedId(null);
      return i - 1;
    });
  }, [history]);

  const redo = useCallback(() => {
    setHIndex((i) => {
      if (i >= history.length - 1) return i;
      setAnnotations(history[i + 1]);
      setSelectedId(null);
      return i + 1;
    });
  }, [history]);

  // load document
  useEffect(() => {
    setLoadError(null);
    setBgUrl(null);
    setView(null);
    setAnnotations([]);
    setHistory([[]]);
    setHIndex(0);
    setSelectedId(null);
    setCurrentPage(1);
    docRef.current = null;
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        await loadPdfDoc(file);
        const doc = await getPdfJsDoc(file);
        if (cancelled) return;
        docRef.current = doc;
        setTotalPages(doc.numPages);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // render current page
  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !file) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(currentPage);
        const unscaled = page.getViewport({ scale: 1 });
        const scalePx = Math.min(800 / unscaled.width, 1.5);
        const canvas = await renderPageToCanvas(doc, currentPage, scalePx);
        if (cancelled) return;
        setBgUrl(canvas.toDataURL("image/png"));
        setView({
          scalePx,
          wPx: canvas.width,
          hPx: canvas.height,
          hPts: unscaled.height,
        });
        canvas.width = 0;
        canvas.height = 0;
      } catch (err) {
        if (!cancelled) toast.error((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPage, file, totalPages]);

  const startOver = () => setFiles([]);

  const pageAnns = annotations.filter((a) => a.page === currentPage);
  const selectedAnn = annotations.find((a) => a.id === selectedId) ?? null;

  // ---- coordinate helpers bound to current view ----
  function annScreenBox(a: Annotation): ScreenBox {
    const v = viewRef.current!;
    if (a.type === "line") {
      const p1 = pdfToScreen(a.x1!, a.y1!, v.scalePx, v.hPts);
      const p2 = pdfToScreen(a.x2!, a.y2!, v.scalePx, v.hPts);
      const left = Math.min(p1.x, p2.x);
      const top = Math.min(p1.y, p2.y);
      return {
        left,
        top,
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
      };
    }
    if (a.type === "pen") {
      const pts = a.points!.map((p) =>
        pdfToScreen(p.x, p.y, v.scalePx, v.hPts)
      );
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      return {
        left,
        top,
        width: Math.max(...xs) - left,
        height: Math.max(...ys) - top,
      };
    }
    return pdfBoxToScreen(
      { x: a.x!, y: a.y!, w: a.w!, h: a.h! },
      v.scalePx,
      v.hPts
    );
  }

  function localPoint(clientX: number, clientY: number) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { lx: clientX - rect.left, ly: clientY - rect.top };
  }

  function hitTest(lx: number, ly: number): Annotation | null {
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const b = annScreenBox(pageAnns[i]);
      const pad = 6;
      if (
        lx >= b.left - pad &&
        lx <= b.left + b.width + pad &&
        ly >= b.top - pad &&
        ly <= b.top + b.height + pad
      ) {
        return pageAnns[i];
      }
    }
    return null;
  }

  // ---- creation ----
  function makeStyleProps(t: AnnType): Partial<Annotation> {
    if (t === "highlight")
      return { fill: "#ffff00", stroke: "none", strokeWidth: 0, opacity: 0.4 };
    if (t === "whiteout")
      return { fill: "#ffffff", stroke: "none", strokeWidth: 0, opacity: 1 };
    if (t === "redact")
      return { fill: "#000000", stroke: "none", strokeWidth: 0, opacity: 1 };
    return {
      stroke: style.stroke,
      fill: style.hasFill ? style.fill : "none",
      strokeWidth: style.strokeWidth,
      opacity: style.opacity,
    };
  }

  function placeText(lx: number, ly: number) {
    const v = viewRef.current!;
    const wPts = 160;
    const hPts = style.fontSize * 1.6;
    const box = screenBoxToPdf(
      { left: lx, top: ly, width: wPts * v.scalePx, height: hPts * v.scalePx },
      v.scalePx,
      v.hPts
    );
    const ann: Annotation = {
      id: uid(),
      page: currentPage,
      type: "text",
      ...box,
      text: "",
      fontKey: style.fontKey,
      fontSize: style.fontSize,
      color: style.color,
      bold: style.bold,
    };
    commit([...annotations, ann]);
    setSelectedId(ann.id);
    setTool("select");
  }

  function onImageChosen(f: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const v = viewRef.current!;
        const maxW = 220;
        const wPts = Math.min(maxW, img.width);
        const hPts = wPts * (img.height / img.width);
        const pt = pendingImgPt.current ?? {
          lx: v.wPx / 2 - (wPts * v.scalePx) / 2,
          ly: v.hPx / 2 - (hPts * v.scalePx) / 2,
        };
        const box = screenBoxToPdf(
          {
            left: pt.lx,
            top: pt.ly,
            width: wPts * v.scalePx,
            height: hPts * v.scalePx,
          },
          v.scalePx,
          v.hPts
        );
        const kind: "png" | "jpg" =
          f.type === "image/png" || /\.png$/i.test(f.name) ? "png" : "jpg";
        const ann: Annotation = {
          id: uid(),
          page: currentPage,
          type: "image",
          ...box,
          dataUrl,
          imgKind: kind,
        };
        commit([...annotations, ann]);
        setSelectedId(ann.id);
        setTool("select");
        pendingImgPt.current = null;
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(f);
  }

  // ---- pointer handling ----
  function onOverlayPointerDown(e: React.PointerEvent) {
    if (!view) return;
    const { lx, ly } = localPoint(e.clientX, e.clientY);

    if (tool === "select") {
      const hit = hitTest(lx, ly);
      setSelectedId(hit ? hit.id : null);
      if (hit) {
        opRef.current = {
          type: "move",
          id: hit.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          orig: hit,
        };
      }
      return;
    }
    if (tool === "text") {
      placeText(lx, ly);
      return;
    }
    if (tool === "image") {
      pendingImgPt.current = { lx, ly };
      imageInputRef.current?.click();
      return;
    }
    if (tool === "pen") {
      opRef.current = { type: "pen", pts: [{ x: lx, y: ly }] };
      setDraft({ kind: "pen", pts: [{ x: lx, y: ly }] });
      return;
    }
    if (tool === "line") {
      opRef.current = { type: "draw", tool, sx: lx, sy: ly };
      setDraft({ kind: "line", x1: lx, y1: ly, x2: lx, y2: ly });
      return;
    }
    // box drawing tools
    opRef.current = { type: "draw", tool, sx: lx, sy: ly };
    setDraft({
      kind: "box",
      type: tool as AnnType,
      left: lx,
      top: ly,
      width: 0,
      height: 0,
    });
  }

  function startResize(e: React.PointerEvent, handle: Handle, a: Annotation) {
    e.stopPropagation();
    opRef.current = {
      type: "resize",
      id: a.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origBox: annScreenBox(a),
      orig: a,
    };
  }

  // global move/up
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const op = opRef.current;
      const v = viewRef.current;
      if (!op || !v) return;

      if (op.type === "draw") {
        const { lx, ly } = localPoint(e.clientX, e.clientY);
        if (op.tool === "line") {
          setDraft({ kind: "line", x1: op.sx, y1: op.sy, x2: lx, y2: ly });
        } else {
          setDraft({
            kind: "box",
            type: op.tool as AnnType,
            left: Math.min(op.sx, lx),
            top: Math.min(op.sy, ly),
            width: Math.abs(lx - op.sx),
            height: Math.abs(ly - op.sy),
          });
        }
      } else if (op.type === "pen") {
        const { lx, ly } = localPoint(e.clientX, e.clientY);
        op.pts.push({ x: lx, y: ly });
        setDraft({ kind: "pen", pts: [...op.pts] });
      } else if (op.type === "move") {
        const dxScreen = e.clientX - op.startClientX;
        const dyScreen = e.clientY - op.startClientY;
        const dxPdf = dxScreen / v.scalePx;
        const dyPdf = -dyScreen / v.scalePx;
        setAnnotations((prev) =>
          prev.map((a) => {
            if (a.id !== op.id) return a;
            const o = op.orig;
            if (a.type === "line") {
              return {
                ...a,
                x1: o.x1! + dxPdf,
                y1: o.y1! + dyPdf,
                x2: o.x2! + dxPdf,
                y2: o.y2! + dyPdf,
              };
            }
            if (a.type === "pen") {
              return {
                ...a,
                points: o.points!.map((p) => ({
                  x: p.x + dxPdf,
                  y: p.y + dyPdf,
                })),
              };
            }
            return { ...a, x: o.x! + dxPdf, y: o.y! + dyPdf };
          })
        );
      } else if (op.type === "resize") {
        const dx = e.clientX - op.startClientX;
        const dy = e.clientY - op.startClientY;
        let { left, top, width, height } = op.origBox;
        const h = op.handle;
        if (h.includes("w")) {
          left += dx;
          width -= dx;
        }
        if (h.includes("e")) width += dx;
        if (h.includes("n")) {
          top += dy;
          height -= dy;
        }
        if (h.includes("s")) height += dy;
        if (width < 8) width = 8;
        if (height < 8) height = 8;
        const box = screenBoxToPdf({ left, top, width, height }, v.scalePx, v.hPts);
        setAnnotations((prev) =>
          prev.map((a) => (a.id === op.id ? { ...a, ...box } : a))
        );
      }
    }

    function onUp() {
      const op = opRef.current;
      const v = viewRef.current;
      opRef.current = null;
      if (!v) {
        setDraft(null);
        return;
      }

      // move / resize: commit the moved annotations snapshot
      if (op && (op.type === "move" || op.type === "resize")) {
        commit(annotationsRef.current);
        setDraft(null);
        return;
      }

      // draw / line / pen: bake the in-progress draft into an annotation
      const draftNow = draftRef.current;
      if (!draftNow) {
        setDraft(null);
        return;
      }
      let ann: Annotation | null = null;
      if (draftNow.kind === "box") {
        if (draftNow.width >= 3 && draftNow.height >= 3) {
          const box = screenBoxToPdf(
            {
              left: draftNow.left,
              top: draftNow.top,
              width: draftNow.width,
              height: draftNow.height,
            },
            v.scalePx,
            v.hPts
          );
          ann = {
            id: uid(),
            page: currentPage,
            type: draftNow.type,
            ...box,
            ...makeStyleProps(draftNow.type),
          };
        }
      } else if (draftNow.kind === "line") {
        if (
          Math.hypot(draftNow.x2 - draftNow.x1, draftNow.y2 - draftNow.y1) >= 3
        ) {
          const p1 = screenToPdf(draftNow.x1, draftNow.y1, v.scalePx, v.hPts);
          const p2 = screenToPdf(draftNow.x2, draftNow.y2, v.scalePx, v.hPts);
          ann = {
            id: uid(),
            page: currentPage,
            type: "line",
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            opacity: style.opacity,
          };
        }
      } else if (draftNow.kind === "pen") {
        if (draftNow.pts.length >= 2) {
          const pts = draftNow.pts.map((p) =>
            screenToPdf(p.x, p.y, v.scalePx, v.hPts)
          );
          ann = {
            id: uid(),
            page: currentPage,
            type: "pen",
            points: pts,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            opacity: style.opacity,
          };
        }
      }
      if (ann) {
        commit([...annotationsRef.current, ann]);
        setSelectedId(ann.id);
        setTool("select");
      }
      setDraft(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit, currentPage, style]);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA"
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, undo, redo]);

  function deleteSelected() {
    if (!selectedId) return;
    commit(annotations.filter((a) => a.id !== selectedId));
    setSelectedId(null);
  }

  // live text edits from the side panel (no history per keystroke)
  const setSelectedText = (text: string) => {
    if (!selectedId) return;
    setAnnotations((prev) =>
      prev.map((a) => (a.id === selectedId ? { ...a, text } : a))
    );
  };

  const commitCurrent = () => commit(annotationsRef.current);

  function duplicateSelected() {
    if (!selectedAnn) return;
    const v = viewRef.current!;
    const off = 12 / v.scalePx;
    const copy: Annotation = { ...selectedAnn, id: uid() };
    if (copy.type === "line") {
      copy.x1! += off;
      copy.x2! += off;
      copy.y1! -= off;
      copy.y2! -= off;
    } else if (copy.type === "pen") {
      copy.points = copy.points!.map((p) => ({ x: p.x + off, y: p.y - off }));
    } else {
      copy.x! += off;
      copy.y! -= off;
    }
    commit([...annotations, copy]);
    setSelectedId(copy.id);
  }

  function patchSelected(patch: Partial<Annotation>) {
    if (!selectedId) return;
    commit(annotations.map((a) => (a.id === selectedId ? { ...a, ...patch } : a)));
  }

  // ---- export ----
  const handleExport = async () => {
    setExporting(true);
    try {
      const bytes = await fileToBytes(file);
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(
          `Could not read "${file.name}". It may be corrupt or password-protected.`
        );
      }
      const pages = doc.getPages();
      const fontCache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
      const getFont = async (key: string, bold: boolean) => {
        const name = pdfFont(key, bold);
        if (!fontCache.has(name)) fontCache.set(name, await doc.embedFont(name));
        return fontCache.get(name)!;
      };

      for (const a of annotations) {
        const page = pages[a.page - 1];
        if (!page) continue;
        const op = a.opacity ?? 1;

        if (a.type === "text") {
          const font = await getFont(a.fontKey ?? "Helvetica", !!a.bold);
          const size = a.fontSize ?? 16;
          const { r, g, b } = hexToRgb(a.color ?? "#000000");
          const topPdf = a.y! + a.h!;
          const lines = (a.text ?? "").split("\n");
          lines.forEach((line, i) => {
            page.drawText(line, {
              x: a.x!,
              y: topPdf - size * 0.9 - i * size * 1.2,
              size,
              font,
              color: rgb(r, g, b),
            });
          });
        } else if (a.type === "image") {
          const img =
            a.imgKind === "png"
              ? await doc.embedPng(a.dataUrl!)
              : await doc.embedJpg(a.dataUrl!);
          page.drawImage(img, { x: a.x!, y: a.y!, width: a.w!, height: a.h! });
        } else if (a.type === "line") {
          const { r, g, b } = hexToRgb(a.stroke ?? "#000000");
          page.drawLine({
            start: { x: a.x1!, y: a.y1! },
            end: { x: a.x2!, y: a.y2! },
            thickness: a.strokeWidth ?? 2,
            color: rgb(r, g, b),
            opacity: op,
          });
        } else if (a.type === "pen") {
          const { r, g, b } = hexToRgb(a.stroke ?? "#000000");
          const pts = a.points ?? [];
          for (let i = 1; i < pts.length; i++) {
            page.drawLine({
              start: { x: pts[i - 1].x, y: pts[i - 1].y },
              end: { x: pts[i].x, y: pts[i].y },
              thickness: a.strokeWidth ?? 2,
              color: rgb(r, g, b),
              opacity: op,
            });
          }
        } else {
          // rect / ellipse / highlight / whiteout / redact
          const hasFill = a.fill && a.fill !== "none";
          const fillRgb = hasFill ? hexToRgb(a.fill!) : null;
          const hasStroke = a.stroke && a.stroke !== "none" && (a.strokeWidth ?? 0) > 0;
          const strokeRgb = hasStroke ? hexToRgb(a.stroke!) : null;
          if (a.type === "ellipse") {
            page.drawEllipse({
              x: a.x! + a.w! / 2,
              y: a.y! + a.h! / 2,
              xScale: a.w! / 2,
              yScale: a.h! / 2,
              color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
              borderColor: strokeRgb
                ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b)
                : undefined,
              borderWidth: hasStroke ? a.strokeWidth : undefined,
              opacity: fillRgb ? op : undefined,
              borderOpacity: hasStroke ? op : undefined,
            });
          } else {
            page.drawRectangle({
              x: a.x!,
              y: a.y!,
              width: a.w!,
              height: a.h!,
              color: fillRgb ? rgb(fillRgb.r, fillRgb.g, fillRgb.b) : undefined,
              borderColor: strokeRgb
                ? rgb(strokeRgb.r, strokeRgb.g, strokeRgb.b)
                : undefined,
              borderWidth: hasStroke ? a.strokeWidth : undefined,
              opacity: fillRgb ? op : undefined,
              borderOpacity: hasStroke ? op : undefined,
            });
          }
        }
      }

      const out = await doc.save();
      downloadBytes(out, "edited.pdf");
      toast.success("Edited PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  // ---- render helpers ----
  function renderSvgAnn(a: Annotation, key: string, isDraft = false) {
    const common = {
      opacity: a.opacity ?? 1,
      pointerEvents: "none" as const,
    };
    const strokeVal = a.stroke && a.stroke !== "none" ? a.stroke : "none";
    const fillVal = a.fill && a.fill !== "none" ? a.fill : "none";
    if (a.type === "line") {
      const v = viewRef.current!;
      const p1 = pdfToScreen(a.x1!, a.y1!, v.scalePx, v.hPts);
      const p2 = pdfToScreen(a.x2!, a.y2!, v.scalePx, v.hPts);
      return (
        <line
          key={key}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke={strokeVal}
          strokeWidth={(a.strokeWidth ?? 2) * (viewRef.current!.scalePx || 1)}
          style={common}
        />
      );
    }
    if (a.type === "pen") {
      const v = viewRef.current!;
      const pts = a
        .points!.map((p) => {
          const s = pdfToScreen(p.x, p.y, v.scalePx, v.hPts);
          return `${s.x},${s.y}`;
        })
        .join(" ");
      return (
        <polyline
          key={key}
          points={pts}
          fill="none"
          stroke={strokeVal}
          strokeWidth={(a.strokeWidth ?? 2) * v.scalePx}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={common}
        />
      );
    }
    const b = annScreenBox(a);
    const sw = (a.strokeWidth ?? 0) * viewRef.current!.scalePx;
    if (a.type === "ellipse") {
      return (
        <ellipse
          key={key}
          cx={b.left + b.width / 2}
          cy={b.top + b.height / 2}
          rx={b.width / 2}
          ry={b.height / 2}
          fill={fillVal}
          stroke={strokeVal}
          strokeWidth={sw}
          style={common}
        />
      );
    }
    return (
      <rect
        key={key}
        x={b.left}
        y={b.top}
        width={b.width}
        height={b.height}
        fill={fillVal}
        stroke={strokeVal}
        strokeWidth={sw}
        style={{
          ...common,
          mixBlendMode: a.type === "highlight" ? "multiply" : undefined,
        }}
      />
    );
  }

  const cursor =
    tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <ToolShell
      title="PDF Editor"
      description="Draw text, images, shapes and redactions on top of your PDF, then bake them in."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && (
        <EmptyState>
          Choose a PDF above to start adding annotations. Nothing is uploaded.
        </EmptyState>
      )}

      {loadError && <LoadError message={loadError} onRetry={startOver} />}

      {file && !loadError && (
        <TooltipProvider>
          <div className="space-y-4">
            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border p-2">
              {TOOLS.map(({ tool: t, icon: Icon, label }) => {
                const btn = (
                  <Button
                    key={t}
                    variant={tool === t ? "default" : "ghost"}
                    size="icon"
                    onClick={() => {
                      setTool(t);
                      if (t !== "select") setSelectedId(null);
                    }}
                    aria-label={label}
                    title={label}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                );
                if (t === "redact") {
                  return (
                    <Tooltip key={t}>
                      <TooltipTrigger render={btn} />
                      <TooltipContent>
                        Redact covers content visually only — it does not remove
                        the underlying text.
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return btn;
              })}

              <div className="mx-1 h-6 w-px bg-border" />

              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={hIndex <= 0}
                title="Undo"
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={hIndex >= history.length - 1}
                title="Redo"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={duplicateSelected}
                disabled={!selectedAnn}
                title="Duplicate"
                aria-label="Duplicate selected"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={deleteSelected}
                disabled={!selectedAnn}
                title="Delete"
                aria-label="Delete selected"
              >
                <Trash2 className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={startOver}
              >
                Start over
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              {/* canvas + overlay */}
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="overflow-auto rounded-lg border bg-muted/30 p-3">
                  {view && bgUrl ? (
                    <div
                      ref={overlayRef}
                      onPointerDown={onOverlayPointerDown}
                      className="relative mx-auto select-none"
                      style={{ width: view.wPx, height: view.hPx, cursor }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={bgUrl}
                        alt={`Page ${currentPage}`}
                        className="absolute inset-0 h-full w-full"
                        draggable={false}
                      />
                      <svg
                        className="absolute inset-0"
                        width={view.wPx}
                        height={view.hPx}
                      >
                        {pageAnns
                          .filter(
                            (a) => a.type !== "text" && a.type !== "image"
                          )
                          .map((a) => renderSvgAnn(a, a.id))}
                        {draft && draft.kind === "line" && (
                          <line
                            x1={draft.x1}
                            y1={draft.y1}
                            x2={draft.x2}
                            y2={draft.y2}
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth * view.scalePx}
                          />
                        )}
                        {draft && draft.kind === "pen" && (
                          <polyline
                            points={draft.pts
                              .map((p) => `${p.x},${p.y}`)
                              .join(" ")}
                            fill="none"
                            stroke={style.stroke}
                            strokeWidth={style.strokeWidth * view.scalePx}
                            strokeLinecap="round"
                          />
                        )}
                        {draft && draft.kind === "box" && (
                          <rect
                            x={draft.left}
                            y={draft.top}
                            width={draft.width}
                            height={draft.height}
                            fill={
                              draft.type === "highlight"
                                ? "#ffff00"
                                : draft.type === "whiteout"
                                ? "#ffffff"
                                : draft.type === "redact"
                                ? "#000000"
                                : style.hasFill
                                ? style.fill
                                : "none"
                            }
                            fillOpacity={draft.type === "highlight" ? 0.4 : 1}
                            stroke={
                              ["highlight", "whiteout", "redact"].includes(
                                draft.type
                              )
                                ? "none"
                                : style.stroke
                            }
                            strokeWidth={style.strokeWidth * view.scalePx}
                          />
                        )}
                      </svg>

                      {/* text + image annotations */}
                      {pageAnns
                        .filter((a) => a.type === "text" || a.type === "image")
                        .map((a) => {
                          const b = annScreenBox(a);
                          if (a.type === "image") {
                            return (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={a.id}
                                src={a.dataUrl}
                                alt=""
                                className="absolute"
                                draggable={false}
                                style={{
                                  left: b.left,
                                  top: b.top,
                                  width: b.width,
                                  height: b.height,
                                  opacity: a.opacity ?? 1,
                                }}
                              />
                            );
                          }
                          const empty = !a.text;
                          return (
                            <div
                              key={a.id}
                              className="absolute overflow-hidden whitespace-pre-wrap break-words leading-tight"
                              style={{
                                left: b.left,
                                top: b.top,
                                minWidth: b.width,
                                fontFamily:
                                  FONT_CSS[a.fontKey ?? "Helvetica"] ??
                                  "sans-serif",
                                fontSize: (a.fontSize ?? 16) * view.scalePx,
                                fontWeight: a.bold ? 700 : 400,
                                color: empty ? "#9ca3af" : a.color,
                                cursor: "move",
                              }}
                            >
                              {empty ? "Type in the side panel…" : a.text}
                            </div>
                          );
                        })}

                      {/* selection box + handles */}
                      {selectedAnn &&
                        selectedAnn.page === currentPage &&
                        (() => {
                          const b = annScreenBox(selectedAnn);
                          const resizable = BOX_TYPES.includes(
                            selectedAnn.type
                          );
                          return (
                            <div
                              className="pointer-events-none absolute border border-primary"
                              style={{
                                left: b.left - 1,
                                top: b.top - 1,
                                width: b.width + 2,
                                height: b.height + 2,
                              }}
                            >
                              {resizable &&
                                HANDLES.map((hd) => {
                                  const pos: React.CSSProperties = {
                                    position: "absolute",
                                  };
                                  if (hd.includes("n")) pos.top = -4;
                                  if (hd.includes("s")) pos.bottom = -4;
                                  if (hd.includes("w")) pos.left = -4;
                                  if (hd.includes("e")) pos.right = -4;
                                  if (hd === "n" || hd === "s") {
                                    pos.left = "50%";
                                    pos.marginLeft = -4;
                                  }
                                  if (hd === "e" || hd === "w") {
                                    pos.top = "50%";
                                    pos.marginTop = -4;
                                  }
                                  return (
                                    <div
                                      key={hd}
                                      onPointerDown={(e) =>
                                        startResize(e, hd, selectedAnn)
                                      }
                                      className="pointer-events-auto h-2 w-2 rounded-sm border border-primary bg-background"
                                      style={pos}
                                    />
                                  );
                                })}
                            </div>
                          );
                        })()}
                    </div>
                  ) : (
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                      Rendering page…
                    </div>
                  )}
                </div>
              </div>

              {/* side panel */}
              <SidePanel
                tool={tool}
                selected={selectedAnn}
                style={style}
                setStyle={setStyle}
                patchSelected={patchSelected}
                setSelectedText={setSelectedText}
                commitCurrent={commitCurrent}
              />
            </div>

            <ProcessButton onClick={handleExport} loading={exporting}>
              Export edited PDF
            </ProcessButton>
          </div>
        </TooltipProvider>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImageChosen(f);
          e.target.value = "";
        }}
      />
    </ToolShell>
  );
}

// ---------------------------------------------------------------------------

interface StyleState {
  stroke: string;
  fill: string;
  hasFill: boolean;
  strokeWidth: number;
  opacity: number;
  fontKey: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

function SidePanel({
  tool,
  selected,
  style,
  setStyle,
  patchSelected,
  setSelectedText,
  commitCurrent,
}: {
  tool: Tool;
  selected: Annotation | null;
  style: StyleState;
  setStyle: React.Dispatch<React.SetStateAction<StyleState>>;
  patchSelected: (patch: Partial<Annotation>) => void;
  setSelectedText: (text: string) => void;
  commitCurrent: () => void;
}) {
  const num = (v: number | readonly number[]) =>
    Array.isArray(v) ? v[0] : (v as number);

  // decide which controls to show
  const target = selected
    ? selected.type
    : tool !== "select"
    ? (tool as AnnType)
    : null;

  if (!target) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Pick a tool or select an annotation to edit its properties.
      </div>
    );
  }

  const isText = target === "text";
  const isShape = ["rect", "ellipse", "line", "pen"].includes(target);
  const isFillShape = ["rect", "ellipse"].includes(target);
  const isTinted = ["highlight", "whiteout", "redact"].includes(target);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="text-sm font-medium capitalize">{target} properties</p>

      {isText && (
        <>
          {selected ? (
            <div className="space-y-2">
              <Label htmlFor="text-content">Text</Label>
              <textarea
                id="text-content"
                autoFocus
                rows={3}
                placeholder="Type your text…"
                value={selected.text ?? ""}
                onChange={(e) => setSelectedText(e.target.value)}
                onBlur={commitCurrent}
                className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click on the page to place a text box, then type here.
            </p>
          )}
          <div className="space-y-2">
            <Label>Font</Label>
            <Select
              value={selected?.fontKey ?? style.fontKey}
              onValueChange={(v) => {
                if (!v) return;
                if (selected) patchSelected({ fontKey: v });
                else setStyle((s) => ({ ...s, fontKey: v }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Helvetica">Helvetica</SelectItem>
                <SelectItem value="TimesRoman">Times Roman</SelectItem>
                <SelectItem value="Courier">Courier</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Size: {selected?.fontSize ?? style.fontSize}</Label>
            <Slider
              min={6}
              max={96}
              step={1}
              value={[selected?.fontSize ?? style.fontSize]}
              onValueChange={(v) => {
                const n = num(v);
                if (selected) patchSelected({ fontSize: n });
                else setStyle((s) => ({ ...s, fontSize: n }));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <input
              type="color"
              value={selected?.color ?? style.color}
              onChange={(e) => {
                const c = e.target.value;
                if (selected) patchSelected({ color: c });
                else setStyle((s) => ({ ...s, color: c }));
              }}
              className="h-9 w-full rounded border"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected?.bold ?? style.bold}
              onChange={(e) => {
                const b = e.target.checked;
                if (selected) patchSelected({ bold: b });
                else setStyle((s) => ({ ...s, bold: b }));
              }}
            />
            Bold
          </label>
        </>
      )}

      {(isShape || isTinted) && (
        <>
          {!isTinted && (
            <div className="space-y-2">
              <Label>Stroke color</Label>
              <input
                type="color"
                value={selected?.stroke ?? style.stroke}
                onChange={(e) => {
                  const c = e.target.value;
                  if (selected) patchSelected({ stroke: c });
                  else setStyle((s) => ({ ...s, stroke: c }));
                }}
                className="h-9 w-full rounded border"
              />
            </div>
          )}
          {!isTinted && (
            <div className="space-y-2">
              <Label>Stroke width: {selected?.strokeWidth ?? style.strokeWidth}</Label>
              <Slider
                min={0}
                max={20}
                step={1}
                value={[selected?.strokeWidth ?? style.strokeWidth]}
                onValueChange={(v) => {
                  const n = num(v);
                  if (selected) patchSelected({ strokeWidth: n });
                  else setStyle((s) => ({ ...s, strokeWidth: n }));
                }}
              />
            </div>
          )}
          {isFillShape && !selected && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={style.hasFill}
                onChange={(e) =>
                  setStyle((s) => ({ ...s, hasFill: e.target.checked }))
                }
              />
              Fill
            </label>
          )}
          {isFillShape && (
            <div className="space-y-2">
              <Label>Fill color</Label>
              <input
                type="color"
                value={
                  selected
                    ? selected.fill && selected.fill !== "none"
                      ? selected.fill
                      : "#ffffff"
                    : style.fill
                }
                onChange={(e) => {
                  const c = e.target.value;
                  if (selected) patchSelected({ fill: c });
                  else setStyle((s) => ({ ...s, fill: c, hasFill: true }));
                }}
                className="h-9 w-full rounded border"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>
              Opacity:{" "}
              {(selected?.opacity ?? style.opacity).toFixed(2)}
            </Label>
            <Slider
              min={0.05}
              max={1}
              step={0.05}
              value={[selected?.opacity ?? style.opacity]}
              onValueChange={(v) => {
                const n = num(v);
                if (selected) patchSelected({ opacity: n });
                else setStyle((s) => ({ ...s, opacity: n }));
              }}
            />
          </div>
        </>
      )}

      {target === "image" && (
        <p className="text-sm text-muted-foreground">
          Drag the corners to resize, or drag the image to move it.
        </p>
      )}
    </div>
  );
}

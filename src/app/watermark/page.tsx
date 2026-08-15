"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { LoadError } from "@/components/LoadError";
import { EmptyState } from "@/components/EmptyState";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { fileToBytes, loadPdfDoc } from "@/lib/pdf/load";
import { getPdfJsDoc, renderPageToCanvas } from "@/lib/pdf/render";
import { downloadBytes } from "@/lib/download";
import { parseRanges } from "@/lib/parseRanges";

type HPos = "left" | "center" | "right";
type VPos = "top" | "middle" | "bottom";

const POSITIONS: { h: HPos; v: VPos; label: string }[] = [
  { h: "left", v: "top", label: "Top left" },
  { h: "center", v: "top", label: "Top center" },
  { h: "right", v: "top", label: "Top right" },
  { h: "left", v: "middle", label: "Middle left" },
  { h: "center", v: "middle", label: "Center" },
  { h: "right", v: "middle", label: "Middle right" },
  { h: "left", v: "bottom", label: "Bottom left" },
  { h: "center", v: "bottom", label: "Bottom center" },
  { h: "right", v: "bottom", label: "Bottom right" },
];

const FONT_MAP: Record<string, keyof typeof StandardFonts> = {
  Helvetica: "Helvetica",
  HelveticaBold: "HelveticaBold",
  TimesRoman: "TimesRoman",
  Courier: "Courier",
};

const MARGIN = 24;

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  return { r, g, b };
}

function cssFont(fontKey: string) {
  switch (fontKey) {
    case "HelveticaBold":
      return { family: "sans-serif", weight: "bold" };
    case "TimesRoman":
      return { family: "serif", weight: "normal" };
    case "Courier":
      return { family: "monospace", weight: "normal" };
    default:
      return { family: "sans-serif", weight: "normal" };
  }
}

// anchor box bottom-left in a coordinate space of size (W,H), y measured from
// the same origin as `bottomUp` implies. Returns box origin (x = left, y = the
// coordinate of the box's lower edge when bottomUp, upper edge otherwise).
function anchorBox(
  W: number,
  H: number,
  w: number,
  h: number,
  hPos: HPos,
  vPos: VPos,
  margin: number,
  bottomUp: boolean
) {
  let x = margin;
  if (hPos === "center") x = (W - w) / 2;
  else if (hPos === "right") x = W - w - margin;

  let y: number;
  if (bottomUp) {
    // pdf-lib: y is bottom edge, origin bottom-left
    if (vPos === "top") y = H - h - margin;
    else if (vPos === "middle") y = (H - h) / 2;
    else y = margin;
  } else {
    // canvas: y is top edge, origin top-left
    if (vPos === "top") y = margin;
    else if (vPos === "middle") y = (H - h) / 2;
    else y = H - h - margin;
  }
  return { x, y };
}

export default function WatermarkPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [tab, setTab] = useState("text");

  // shared
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(-45);
  const [posIndex, setPosIndex] = useState(4);
  const [tile, setTile] = useState(false);
  const [pagesMode, setPagesMode] = useState<"all" | "range">("all");
  const [rangeText, setRangeText] = useState("");

  // text
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState(48);
  const [fontKey, setFontKey] = useState("HelveticaBold");
  const [color, setColor] = useState("#ff0000");

  // image
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imgScale, setImgScale] = useState(0.4);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewScaleRef = useRef(1);
  const imgElRef = useRef<HTMLImageElement | null>(null);

  const file = files[0];
  const imageFile = imageFiles[0];
  const pos = POSITIONS[posIndex];

  const startOver = () => {
    setFiles([]);
    setImageFiles([]);
  };

  // reset derived state on file replace
  useEffect(() => {
    baseCanvasRef.current = null;
    previewScaleRef.current = 1;
    setLoadError(null);
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        await loadPdfDoc(file);
        const doc = await getPdfJsDoc(file);
        const page = await doc.getPage(1);
        const vp = page.getViewport({ scale: 1 });
        const scale = 500 / vp.width;
        previewScaleRef.current = scale;
        const canvas = await renderPageToCanvas(doc, 1, scale);
        if (cancelled) return;
        baseCanvasRef.current = canvas;
        drawPreview();
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // load image element for preview
  useEffect(() => {
    if (!imageFile) {
      imgElRef.current = null;
      return;
    }
    const url = URL.createObjectURL(imageFile);
    const img = new Image();
    img.onload = () => {
      imgElRef.current = img;
      drawPreview();
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageFile]);

  const drawPreview = useCallback(() => {
    const base = baseCanvasRef.current;
    const canvas = canvasRef.current;
    if (!base || !canvas) return;
    const W = base.width;
    const H = base.height;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);
    ctx.save();
    ctx.globalAlpha = opacity;

    if (tab === "text") {
      const sizePx = fontSize * previewScaleRef.current;
      const { family, weight } = cssFont(fontKey);
      ctx.font = `${weight} ${sizePx}px ${family}`;
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const w = ctx.measureText(text).width;
      const h = sizePx;
      const drawOne = (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((-rotation * Math.PI) / 180);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      };
      if (tile) {
        const stepX = Math.max(w * 1.5, 60);
        const stepY = Math.max(h * 1.5, 60);
        for (let y = stepY / 2; y < H; y += stepY)
          for (let x = stepX / 2; x < W; x += stepX) drawOne(x, y);
      } else {
        const box = anchorBox(W, H, w, h, pos.h, pos.v, MARGIN, false);
        drawOne(box.x + w / 2, box.y + h / 2);
      }
    } else if (tab === "image" && imgElRef.current) {
      const img = imgElRef.current;
      const drawW = W * imgScale;
      const drawH = drawW * (img.height / img.width);
      const drawOne = (cx: number, cy: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((-rotation * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      };
      if (tile) {
        const stepX = Math.max(drawW * 1.5, 60);
        const stepY = Math.max(drawH * 1.5, 60);
        for (let y = stepY / 2; y < H; y += stepY)
          for (let x = stepX / 2; x < W; x += stepX) drawOne(x, y);
      } else {
        const box = anchorBox(W, H, drawW, drawH, pos.h, pos.v, MARGIN, false);
        drawOne(box.x + drawW / 2, box.y + drawH / 2);
      }
    }
    ctx.restore();
  }, [
    opacity,
    rotation,
    tab,
    fontSize,
    fontKey,
    color,
    text,
    tile,
    pos,
    imgScale,
  ]);

  // debounced live preview
  useEffect(() => {
    const t = setTimeout(drawPreview, 200);
    return () => clearTimeout(t);
  }, [drawPreview]);

  function targetPageIndices(count: number): number[] {
    if (pagesMode === "all") return Array.from({ length: count }, (_, i) => i);
    return parseRanges(rangeText, count).map((p) => p - 1);
  }

  const handleApply = async () => {
    setLoading(true);
    setProgress(0);
    try {
      if (tab === "image" && !imageFile)
        throw new Error("Choose an image to use as the watermark.");

      const bytes = await fileToBytes(file);
      let doc: PDFDocument;
      try {
        doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(
          `Could not read "${file.name}". It may be corrupt or password-protected.`
        );
      }
      const pageCount = doc.getPageCount();
      const targets = targetPageIndices(pageCount);
      if (targets.length === 0) throw new Error("No pages selected.");

      const rot = degrees(rotation);

      if (tab === "text") {
        if (!text) throw new Error("Enter watermark text.");
        const font = await doc.embedFont(StandardFonts[FONT_MAP[fontKey]]);
        const { r, g, b } = hexToRgb(color);
        const w = font.widthOfTextAtSize(text, fontSize);
        const h = fontSize;
        for (let idx = 0; idx < targets.length; idx++) {
          const page = doc.getPage(targets[idx]);
          const { width: W, height: H } = page.getSize();
          const draw = (x: number, y: number) =>
            page.drawText(text, {
              x,
              y,
              size: fontSize,
              font,
              color: rgb(r, g, b),
              opacity,
              rotate: rot,
            });
          if (tile) {
            const stepX = Math.max(w * 1.5, 60);
            const stepY = Math.max(h * 1.5, 60);
            for (let y = 0; y < H; y += stepY)
              for (let x = 0; x < W; x += stepX) draw(x, y);
          } else {
            const box = anchorBox(W, H, w, h, pos.h, pos.v, MARGIN, true);
            draw(box.x, box.y);
          }
          setProgress(Math.round(((idx + 1) / targets.length) * 100));
        }
      } else {
        const imgBytes = await fileToBytes(imageFile);
        const isPng = /\.png$/i.test(imageFile.name) || imageFile.type === "image/png";
        const embedded = isPng
          ? await doc.embedPng(imgBytes)
          : await doc.embedJpg(imgBytes);
        for (let idx = 0; idx < targets.length; idx++) {
          const page = doc.getPage(targets[idx]);
          const { width: W, height: H } = page.getSize();
          const drawW = W * imgScale;
          const drawH = drawW * (embedded.height / embedded.width);
          const draw = (x: number, y: number) =>
            page.drawImage(embedded, {
              x,
              y,
              width: drawW,
              height: drawH,
              opacity,
              rotate: rot,
            });
          if (tile) {
            const stepX = Math.max(drawW * 1.5, 60);
            const stepY = Math.max(drawH * 1.5, 60);
            for (let y = 0; y < H; y += stepY)
              for (let x = 0; x < W; x += stepX) draw(x, y);
          } else {
            const box = anchorBox(W, H, drawW, drawH, pos.h, pos.v, MARGIN, true);
            draw(box.x, box.y);
          }
          setProgress(Math.round(((idx + 1) / targets.length) * 100));
        }
      }

      const out = await doc.save();
      downloadBytes(out, "watermarked.pdf");
      toast.success("Watermarked PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const sharedControls = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Opacity: {opacity.toFixed(2)}</Label>
        <Slider
          min={0.05}
          max={1}
          step={0.05}
          value={[opacity]}
          onValueChange={(v) => setOpacity(Array.isArray(v) ? v[0] : v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Rotation: {rotation}°</Label>
        <Slider
          min={-90}
          max={90}
          step={1}
          value={[rotation]}
          onValueChange={(v) => setRotation(Array.isArray(v) ? v[0] : v)}
        />
      </div>
      <div className="space-y-2">
        <Label>Position</Label>
        <div className="grid w-32 grid-cols-3 gap-1">
          {POSITIONS.map((p, i) => (
            <button
              key={i}
              type="button"
              title={p.label}
              onClick={() => setPosIndex(i)}
              disabled={tile}
              className={cn(
                "aspect-square rounded border text-xs disabled:opacity-40",
                posIndex === i && !tile
                  ? "border-primary bg-primary/10"
                  : "hover:bg-accent"
              )}
            />
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tile}
            onChange={(e) => setTile(e.target.checked)}
          />
          Tile across page
        </label>
      </div>
      <div className="space-y-2">
        <Label>Pages</Label>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pages"
              checked={pagesMode === "all"}
              onChange={() => setPagesMode("all")}
            />
            All pages
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pages"
              checked={pagesMode === "range"}
              onChange={() => setPagesMode("range")}
            />
            Specific pages
          </label>
          {pagesMode === "range" && (
            <Input
              placeholder="1-3, 5, 8-10"
              value={rangeText}
              onChange={(e) => setRangeText(e.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ToolShell
      title="Add Watermark"
      description="Stamp text or an image on your pages."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {!file && (
        <EmptyState>Choose a PDF above to add a watermark.</EmptyState>
      )}

      {loadError && <LoadError message={loadError} onRetry={startOver} />}

      {file && !loadError && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={startOver}>
                Start over
              </Button>
            </div>
            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
              <TabsList className="flex-wrap">
                <TabsTrigger value="text">Text</TabsTrigger>
                <TabsTrigger value="image">Image</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wm-text">Text</Label>
                  <Input
                    id="wm-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Font size: {fontSize}</Label>
                  <Slider
                    min={8}
                    max={144}
                    step={1}
                    value={[fontSize]}
                    onValueChange={(v) => setFontSize(Array.isArray(v) ? v[0] : v)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Font</Label>
                    <Select value={fontKey} onValueChange={(v) => v && setFontKey(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Helvetica">Helvetica</SelectItem>
                        <SelectItem value="HelveticaBold">
                          Helvetica Bold
                        </SelectItem>
                        <SelectItem value="TimesRoman">Times Roman</SelectItem>
                        <SelectItem value="Courier">Courier</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wm-color">Color</Label>
                    <input
                      id="wm-color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-9 w-full rounded border"
                    />
                  </div>
                </div>
                {sharedControls}
              </TabsContent>

              <TabsContent value="image" className="space-y-4">
                <FileDropzone
                  accept={{
                    "image/png": [".png"],
                    "image/jpeg": [".jpg", ".jpeg"],
                  }}
                  files={imageFiles}
                  onFilesChange={setImageFiles}
                  hint="PNG or JPG"
                />
                <div className="space-y-2">
                  <Label>Scale: {Math.round(imgScale * 100)}% of page width</Label>
                  <Slider
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={[imgScale]}
                    onValueChange={(v) => setImgScale(Array.isArray(v) ? v[0] : v)}
                  />
                </div>
                {sharedControls}
              </TabsContent>
            </Tabs>

            <ProcessButton
              onClick={handleApply}
              loading={loading}
              progress={progress}
            >
              Apply watermark
            </ProcessButton>
          </div>

          <div className="space-y-2">
            <Label>Preview (page 1)</Label>
            <div className="rounded-lg border bg-muted/30 p-3">
              <canvas ref={canvasRef} className="mx-auto h-auto max-w-full" />
            </div>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { PDFDocument, PageSizes } from "pdf-lib";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fileToBytes } from "@/lib/pdf/load";
import { downloadBytes } from "@/lib/download";

interface ImgItem {
  id: string;
  file: File;
  url: string;
}

let idCounter = 0;

function SortableImg({
  item,
  onRemove,
}: {
  item: ImgItem;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative cursor-grab touch-none overflow-hidden rounded-lg border bg-card active:cursor-grabbing hover:shadow-md"
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        className="absolute right-1.5 top-1.5 z-10 rounded bg-background/80 p-1 shadow hover:bg-background"
        aria-label="Remove image"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.file.name}
        className="h-32 w-full object-contain bg-muted/30"
        draggable={false}
      />
      <p className="truncate p-1.5 text-xs">{item.file.name}</p>
    </div>
  );
}

async function imageToEmbedData(
  file: File
): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" }> {
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  const isJpg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name);

  if (isPng) return { bytes: await fileToBytes(file), kind: "png" };
  if (isJpg) return { bytes: await fileToBytes(file), kind: "jpg" };

  // WebP or anything else: rasterize to PNG via canvas
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not load "${file.name}".`));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const base64 = dataUrl.split(",")[1];
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, kind: "png" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ImageToPdfPage() {
  const [items, setItems] = useState<ImgItem[]>([]);
  const [pageSize, setPageSize] = useState("a4");
  const [orientation, setOrientation] = useState("portrait");
  const [margin, setMargin] = useState(0);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const itemsRef = useRef<ImgItem[]>([]);
  itemsRef.current = items;
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url));
    };
  }, []);

  const files = items.map((i) => i.file);

  const handleFilesChange = (newFiles: File[]) => {
    setItems((prev) => {
      // revoke urls for items no longer present
      const kept = prev.filter((p) => newFiles.includes(p.file));
      prev
        .filter((p) => !newFiles.includes(p.file))
        .forEach((p) => URL.revokeObjectURL(p.url));
      const existing = new Set(kept.map((k) => k.file));
      const added = newFiles
        .filter((f) => !existing.has(f))
        .map((file) => ({
          id: `img-${idCounter++}`,
          file,
          url: URL.createObjectURL(file),
        }));
      // preserve the incoming order
      const byFile = new Map(
        [...kept, ...added].map((it) => [it.file, it])
      );
      return newFiles.map((f) => byFile.get(f)!);
    });
  };

  const handleRemove = (id: string) => {
    setItems((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleConvert = async () => {
    setLoading(true);
    setProgress(0);
    try {
      if (items.length === 0) throw new Error("Add at least one image.");
      const doc = await PDFDocument.create();
      const fitToImage = pageSize === "fit";
      const base = pageSize === "letter" ? PageSizes.Letter : PageSizes.A4;

      for (let idx = 0; idx < items.length; idx++) {
        const { bytes, kind } = await imageToEmbedData(items[idx].file);
        const embedded =
          kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        const iw = embedded.width;
        const ih = embedded.height;

        if (fitToImage) {
          const page = doc.addPage([iw + margin * 2, ih + margin * 2]);
          page.drawImage(embedded, {
            x: margin,
            y: margin,
            width: iw,
            height: ih,
          });
        } else {
          let [pw, ph] = base;
          const landscape =
            orientation === "landscape" ||
            (orientation === "auto" && iw > ih);
          if (landscape) [pw, ph] = [ph, pw];
          const page = doc.addPage([pw, ph]);

          const boxW = pw - margin * 2;
          const boxH = ph - margin * 2;
          const scale =
            fitMode === "contain"
              ? Math.min(boxW / iw, boxH / ih)
              : Math.max(boxW / iw, boxH / ih);
          const drawW = iw * scale;
          const drawH = ih * scale;
          const x = margin + (boxW - drawW) / 2;
          const y = margin + (boxH - drawH) / 2;
          page.drawImage(embedded, { x, y, width: drawW, height: drawH });
        }

        setProgress(Math.round(((idx + 1) / items.length) * 100));
        await new Promise((r) => setTimeout(r, 0));
      }

      const out = await doc.save();
      downloadBytes(out, "images.pdf");
      toast.success("PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const fitToImage = pageSize === "fit";

  return (
    <ToolShell title="Image to PDF" description="Turn images into a PDF.">
      <FileDropzone
        accept={{
          "image/png": [".png"],
          "image/jpeg": [".jpg", ".jpeg"],
          "image/webp": [".webp"],
        }}
        multiple
        files={files}
        onFilesChange={handleFilesChange}
        hint="PNG, JPG, or WebP — drag to reorder after adding"
      />

      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => (
                <SortableImg
                  key={item.id}
                  item={item}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Page size</Label>
            <Select value={pageSize} onValueChange={(v) => v && setPageSize(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="fit">Fit to image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Orientation</Label>
            <Select
              value={orientation}
              onValueChange={(v) => v && setOrientation(v)}
              disabled={fitToImage}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">Portrait</SelectItem>
                <SelectItem value="landscape">Landscape</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Margin: {margin} pt</Label>
            <Slider
              min={0}
              max={72}
              step={1}
              value={[margin]}
              onValueChange={(v) => setMargin(Array.isArray(v) ? v[0] : v)}
            />
          </div>
          {!fitToImage && (
            <div className="space-y-2">
              <Label>Fit mode</Label>
              <Select
                value={fitMode}
                onValueChange={(v) => v && setFitMode(v as "contain" | "cover")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="cover">Cover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <ProcessButton
        onClick={handleConvert}
        disabled={items.length === 0}
        loading={loading}
        progress={progress}
      >
        Create PDF
      </ProcessButton>
    </ToolShell>
  );
}

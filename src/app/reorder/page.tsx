"use client";

import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
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
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fileToBytes } from "@/lib/pdf/load";
import { generateThumbnails } from "@/lib/pdf/render";
import { downloadBytes } from "@/lib/download";

interface OrderItem {
  id: string;
  pageIndex: number;
}

let idCounter = 0;
function newId() {
  return `p-${idCounter++}`;
}

function SortableTile({
  item,
  thumb,
  canDelete,
  onCopy,
  onDelete,
}: {
  item: OrderItem;
  thumb: string;
  canDelete: boolean;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
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
      className="relative cursor-grab touch-none rounded-lg border bg-card overflow-hidden active:cursor-grabbing hover:shadow-md"
    >
      <div className="absolute top-1.5 right-1.5 z-10 flex gap-1">
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onCopy(item.id);
          }}
          className="rounded bg-background/80 p-1 shadow hover:bg-background"
          aria-label="Duplicate page"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={!canDelete}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(item.id);
          }}
          className="rounded bg-background/80 p-1 shadow hover:bg-background disabled:opacity-40"
          aria-label="Delete page"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <img
        src={thumb}
        alt={`Page ${item.pageIndex + 1}`}
        className="w-full h-auto"
        draggable={false}
      />
      <Badge
        variant="secondary"
        className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] px-1.5"
      >
        {item.pageIndex + 1}
      </Badge>
    </div>
  );
}

export default function ReorderPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const file = files[0];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!file) {
      setThumbs([]);
      setOrder([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setThumbLoading(true);
      setThumbProgress(0);
      try {
        const result = await generateThumbnails(file, 0.3, (done, total) => {
          if (!cancelled) setThumbProgress(Math.round((done / total) * 100));
        });
        if (!cancelled) {
          setThumbs(result);
          setOrder(result.map((_, i) => ({ id: newId(), pageIndex: i })));
        }
      } catch (err) {
        if (!cancelled) {
          toast.error((err as Error).message);
          setFiles([]);
        }
      } finally {
        if (!cancelled) setThumbLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIndex = prev.findIndex((o) => o.id === active.id);
        const newIndex = prev.findIndex((o) => o.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleCopy = (id: string) => {
    setOrder((prev) => {
      const idx = prev.findIndex((o) => o.id === id);
      if (idx === -1) return prev;
      const copy = { id: newId(), pageIndex: prev[idx].pageIndex };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleDelete = (id: string) => {
    setOrder((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((o) => o.id !== id);
    });
  };

  const resetOrder = () => {
    setOrder(thumbs.map((_, i) => ({ id: newId(), pageIndex: i })));
  };

  const reverseOrder = () => {
    setOrder((prev) => [...prev].reverse());
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      if (order.length === 0) throw new Error("No pages to export.");
      const bytes = await fileToBytes(file);
      let src: PDFDocument;
      try {
        src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error(
          `Could not read "${file.name}". It may be corrupt or password-protected.`
        );
      }
      const out = await PDFDocument.create();
      const pages = await out.copyPages(
        src,
        order.map((o) => o.pageIndex)
      );
      pages.forEach((p) => out.addPage(p));
      const result = await out.save();
      downloadBytes(result, "reordered.pdf");
      toast.success("Reordered PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolShell
      title="Reorder & Delete"
      description="Drag pages into a new order, duplicate, or delete them."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        files={files}
        onFilesChange={setFiles}
        hint="Select a single PDF file"
      />

      {thumbLoading && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Rendering pages…</p>
          <Progress value={thumbProgress} className="h-2" />
        </div>
      )}

      {!thumbLoading && thumbs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetOrder}>
              Reset order
            </Button>
            <Button variant="outline" size="sm" onClick={reverseOrder}>
              Reverse order
            </Button>
            {order.length !== thumbs.length && (
              <span className="text-sm text-muted-foreground">
                {thumbs.length} pages → {order.length} pages
              </span>
            )}
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={order.map((o) => o.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {order.map((item) => (
                  <SortableTile
                    key={item.id}
                    item={item}
                    thumb={thumbs[item.pageIndex]}
                    canDelete={order.length > 1}
                    onCopy={handleCopy}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <ProcessButton onClick={handleApply} loading={loading}>
            Save reordered PDF
          </ProcessButton>
        </>
      )}
    </ToolShell>
  );
}

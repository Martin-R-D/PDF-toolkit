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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { ToolShell } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessButton } from "@/components/ProcessButton";
import { loadPdfDoc, fileToBytes } from "@/lib/pdf/load";
import { downloadBytes } from "@/lib/download";
import { formatBytes } from "@/lib/format";

interface MergeItem {
  id: string;
  file: File;
  pageCount: number | null;
}

function SortableRow({
  item,
  index,
  onRemove,
}: {
  item: MergeItem;
  index: number;
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
      className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-6 text-center text-muted-foreground">{index + 1}</span>
      <span className="flex-1 truncate">{item.file.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {item.pageCount === null ? "…" : `${item.pageCount} pages`}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatBytes(item.file.size)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function MergePage() {
  const [items, setItems] = useState<MergeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const files = items.map((i) => i.file);

  const handleFilesChange = (newFiles: File[]) => {
    setItems((prev) => {
      const existing = new Map(prev.map((i) => [i.file, i]));
      return newFiles.map((file) => {
        const found = existing.get(file);
        if (found) return found;
        return {
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
            .toString(36)
            .slice(2)}`,
          file,
          pageCount: null,
        };
      });
    });
  };

  useEffect(() => {
    let cancelled = false;
    const missing = items.filter((i) => i.pageCount === null);
    if (missing.length === 0) return;
    (async () => {
      for (const item of missing) {
        try {
          const doc = await loadPdfDoc(item.file);
          const count = doc.getPageCount();
          if (cancelled) return;
          setItems((prev) =>
            prev.map((i) => (i.id === item.id ? { ...i, pageCount: count } : i))
          );
        } catch (err) {
          toast.error((err as Error).message);
          if (cancelled) return;
          setItems((prev) => prev.filter((i) => i.id !== item.id));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

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

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleMerge = async () => {
    setLoading(true);
    setProgress(0);
    try {
      const merged = await PDFDocument.create();
      for (let i = 0; i < items.length; i++) {
        const bytes = await fileToBytes(items[i].file);
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch {
          throw new Error(
            `Could not read "${items[i].file.name}". It may be corrupt or password-protected.`
          );
        }
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        setProgress(Math.round(((i + 1) / items.length) * 100));
      }
      const out = await merged.save();
      downloadBytes(out, "merged.pdf");
      toast.success("Merged PDF ready.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <ToolShell
      title="Merge PDFs"
      description="Combine multiple PDFs into one file. Drag to reorder."
    >
      <FileDropzone
        accept={{ "application/pdf": [".pdf"] }}
        multiple
        files={files}
        onFilesChange={handleFilesChange}
        hint="Add two or more PDF files"
      />

      {items.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((item, index) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  index={index}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {items.length > 0 && (
        <ProcessButton
          onClick={handleMerge}
          disabled={items.length < 2}
          loading={loading}
          progress={progress}
        >
          Merge {items.length} PDF{items.length === 1 ? "" : "s"}
        </ProcessButton>
      )}
    </ToolShell>
  );
}

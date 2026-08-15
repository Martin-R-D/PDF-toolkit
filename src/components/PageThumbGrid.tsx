"use client";

import type { ReactNode, CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface PageThumbGridProps {
  thumbs: string[];
  selected?: Set<number>;
  onToggle?: (index: number) => void;
  renderOverlay?: (index: number) => ReactNode;
  itemStyle?: (index: number) => CSSProperties;
}

export function PageThumbGrid({
  thumbs,
  selected,
  onToggle,
  renderOverlay,
  itemStyle,
}: PageThumbGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {thumbs.map((src, i) => {
        const isSelected = selected?.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onToggle?.(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle?.(i);
              }
            }}
            className={cn(
              "relative rounded-lg border bg-card overflow-hidden transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected && "ring-2 ring-primary",
              onToggle && "cursor-pointer hover:shadow-md"
            )}
          >
            {onToggle && (
              <div className="absolute top-1.5 left-1.5 z-10">
                <Checkbox
                  checked={isSelected}
                  tabIndex={-1}
                  aria-hidden
                />
              </div>
            )}
            {renderOverlay && (
              <div className="absolute top-1.5 right-1.5 z-10">
                {renderOverlay(i)}
              </div>
            )}
            <img
              src={src}
              alt={`Page ${i + 1}`}
              className="w-full h-auto transition-transform"
              draggable={false}
              style={itemStyle?.(i)}
            />
            <Badge
              variant="secondary"
              className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] px-1.5"
            >
              {i + 1}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}

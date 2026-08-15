"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { generateThumbnails } from "@/lib/pdf/render";
import { assertFileSize } from "@/lib/pdf/load";
import { isAbortError } from "./useYieldingLoop";

// Cache rendered thumbnails per File object so switching tabs / remounting
// doesn't re-render an already-processed document.
const thumbCache = new WeakMap<File, string[]>();

export function useThumbnails(file: File | undefined, scale = 0.3) {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setError(null);

    if (!file) {
      setThumbs([]);
      setLoading(false);
      setProgress(0);
      return;
    }

    const cached = thumbCache.get(file);
    if (cached) {
      setThumbs(cached);
      setLoading(false);
      setProgress(100);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setThumbs([]);
    setLoading(true);
    setProgress(0);

    (async () => {
      try {
        assertFileSize(file);
        const result = await generateThumbnails(
          file,
          scale,
          (done, total) => setProgress(Math.round((done / total) * 100)),
          controller.signal
        );
        thumbCache.set(file, result);
        setThumbs(result);
      } catch (err) {
        if (isAbortError(err)) return;
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [file, scale]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { thumbs, loading, progress, error, cancel };
}

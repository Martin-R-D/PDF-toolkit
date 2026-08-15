"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class LoopAbortError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

/** Yield to the browser so the UI stays responsive between heavy steps. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export interface RunYieldingLoopOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Runs `task` for each index 0..count-1, awaiting a frame between items so the
 * main thread stays free. Reports progress and honours an AbortSignal.
 */
export async function runYieldingLoop<T>(
  count: number,
  task: (index: number) => Promise<T> | T,
  options: RunYieldingLoopOptions = {}
): Promise<T[]> {
  const { signal, onProgress } = options;
  const results: T[] = [];
  for (let i = 0; i < count; i++) {
    if (signal?.aborted) throw new LoopAbortError();
    results.push(await task(i));
    onProgress?.(i + 1, count);
    await nextFrame();
    if (signal?.aborted) throw new LoopAbortError();
  }
  return results;
}

/**
 * React wrapper around runYieldingLoop that tracks running state / progress and
 * exposes a cancel() function backed by an AbortController.
 */
export function useYieldingLoop() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async <T>(
      count: number,
      task: (index: number) => Promise<T> | T
    ): Promise<T[] | null> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setRunning(true);
      setProgress(0);
      try {
        return await runYieldingLoop(count, task, {
          signal: controller.signal,
          onProgress: (done, total) =>
            setProgress(Math.round((done / total) * 100)),
        });
      } catch (err) {
        if (isAbortError(err)) return null;
        throw err;
      } finally {
        setRunning(false);
        abortRef.current = null;
      }
    },
    []
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { run, cancel, running, progress };
}

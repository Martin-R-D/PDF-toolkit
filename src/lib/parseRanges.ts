export function parseRanges(input: string, maxPage: number): number[] {
  const result = new Set<number>();

  const tokens = input
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (start === 0 || end === 0) throw new Error("Page numbers start at 1.");
      if (start > end)
        throw new Error(`Invalid range "${token}": start is greater than end.`);
      if (end > maxPage)
        throw new Error(`Page ${end} exceeds the document's ${maxPage} pages.`);
      for (let i = start; i <= end; i++) result.add(i);
    } else if (/^\d+$/.test(token)) {
      const page = parseInt(token, 10);
      if (page === 0) throw new Error("Page numbers start at 1.");
      if (page > maxPage)
        throw new Error(
          `Page ${page} exceeds the document's ${maxPage} pages.`
        );
      result.add(page);
    } else {
      throw new Error(`Invalid token "${token}". Use formats like "1-3, 5, 8".`);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

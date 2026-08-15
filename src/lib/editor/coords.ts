export interface Point {
  x: number;
  y: number;
}

/**
 * Convert a screen-space point to a PDF-space point.
 *
 * Screen space: origin top-left, y grows downward, units are CSS pixels of the
 * rendered page canvas. PDF space: origin bottom-left, y grows upward, units are
 * points. `scale` is screen-pixels-per-point (the pdf.js render scale) and
 * `pageHeight` is the page height in points.
 *
 *   // with scale = 2, pageHeight = 100 (canvas is 200px tall):
 *   screenToPdf(0, 0, 2, 100)     === { x: 0,  y: 100 }  // top-left  -> y == pageHeight
 *   screenToPdf(0, 200, 2, 100)   === { x: 0,  y: 0 }    // bottom    -> y == 0
 *   screenToPdf(100, 100, 2, 100) === { x: 50, y: 50 }
 */
export function screenToPdf(
  sx: number,
  sy: number,
  scale: number,
  pageHeight: number
): Point {
  return { x: sx / scale, y: pageHeight - sy / scale };
}

/**
 * Inverse of {@link screenToPdf}.
 *
 *   pdfToScreen(0, 100, 2, 100)  === { x: 0,   y: 0 }
 *   pdfToScreen(0, 0, 2, 100)    === { x: 0,   y: 200 }
 *   pdfToScreen(50, 50, 2, 100)  === { x: 100, y: 100 }
 *   // round-trips:
 *   pdfToScreen(...screenToPdf(30, 40, 2, 100 as any), 2, 100) === { x: 30, y: 40 }
 */
export function pdfToScreen(
  x: number,
  y: number,
  scale: number,
  pageHeight: number
): Point {
  return { x: x * scale, y: (pageHeight - y) * scale };
}

export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PdfBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Convert a screen box (top-left anchored) into a PDF box (bottom-left anchored).
 *
 *   screenBoxToPdf({left:0, top:0, width:100, height:100}, 2, 100)
 *     === { x: 0, y: 50, w: 50, h: 50 }   // top-left screen box sits at top of page
 */
export function screenBoxToPdf(
  box: ScreenBox,
  scale: number,
  pageHeight: number
): PdfBox {
  const ll = screenToPdf(box.left, box.top + box.height, scale, pageHeight);
  return { x: ll.x, y: ll.y, w: box.width / scale, h: box.height / scale };
}

/**
 * Inverse of {@link screenBoxToPdf}.
 *
 *   pdfBoxToScreen({x:0, y:50, w:50, h:50}, 2, 100)
 *     === { left: 0, top: 0, width: 100, height: 100 }
 */
export function pdfBoxToScreen(
  box: PdfBox,
  scale: number,
  pageHeight: number
): ScreenBox {
  const tl = pdfToScreen(box.x, box.y + box.h, scale, pageHeight);
  return { left: tl.x, top: tl.y, width: box.w * scale, height: box.h * scale };
}

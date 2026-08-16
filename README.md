# LocalPDF

Every PDF tool you need, running **100% in your browser**. Merge, split, edit,
compress, OCR and convert PDFs — free, private, and offline.

## Privacy

LocalPDF does all of its work client-side using WebAssembly and JavaScript.
**No files, file contents, or metadata are ever uploaded to any server.** There
are no accounts, no file analytics, and no tracking of your documents. Once the
page has loaded it works fully offline (it's an installable PWA). Your documents
never leave your device.

## Tools

| Tool | Route | What it does |
| --- | --- | --- |
| Merge PDFs | `/merge` | Combine multiple PDFs into one file |
| Split PDF | `/split` | Extract pages or split into several files |
| Rotate Pages | `/rotate` | Fix page orientation |
| Reorder & Delete | `/reorder` | Drag pages into a new order, duplicate or delete |
| Compress PDF | `/compress` | Shrink file size (lossless or rasterized) |
| Add Watermark | `/watermark` | Stamp text or an image on pages |
| PDF to Image | `/pdf-to-image` | Export pages as PNG or JPG |
| Image to PDF | `/image-to-pdf` | Turn images into a PDF |
| PDF Editor | `/editor` | Add text, images, shapes and redactions |
| Compare PDFs | `/compare` | Highlight text and visual changes between two files |
| OCR Scanner | `/ocr` | Make scanned PDFs searchable (Tesseract, 8 languages) |
| PDF to Word | `/pdf-to-docx` | Reconstruct text, lists, tables and images into a DOCX |

## Tech

- [Next.js](https://nextjs.org/) (App Router, static export)
- [pdf-lib](https://pdf-lib.js.org/) and [pdf.js](https://mozilla.github.io/pdf.js/) for PDF read/write/render
- [tesseract.js](https://tesseract.projectnaptha.com/) for OCR
- [docx](https://docx.js.org/), [pixelmatch](https://github.com/mapbox/pixelmatch), [diff](https://github.com/kpdecker/jsdiff)
- Tailwind CSS + shadcn/ui, fonts: Roboto (primary), Inter (secondary)

## Local development

```bash
npm install        # also copies the pdf.js worker into public/
npm run dev        # start the dev server at http://localhost:3000
npm run build      # static export to ./out
npm run lint       # eslint
```

The build emits a fully static site to `out/` — deployable to any static host
(Vercel, Netlify, GitHub Pages, S3, …) with **no server runtime**. A
`vercel.json` is included for one-click Vercel deploys.

Set `NEXT_PUBLIC_SITE_URL` to your deployment origin so canonical URLs, the
sitemap and Open Graph tags point at the right domain.

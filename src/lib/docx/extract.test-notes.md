# PDF → DOCX extraction heuristics

All thresholds live in `extract.ts`. This table is the single place to review /
tune them. Everything is derived per page from the pdf.js text content, operator
list, and annotations — nothing is fabricated (notably: text fill color is not
exposed by pdf.js text content, so color is intentionally omitted).

| Step | Heuristic | Threshold / rule | Where |
| --- | --- | --- | --- |
| Font size | from transform | `round(hypot(t[2], t[3]), 1dp)` | `extractPage` |
| Bold | font name / weight | name `/bold\|black\|heavy\|semibold\|[-,]bd/i` OR `fontWeight >= 600` | `isBold` |
| Italic | font name | `/italic\|oblique\|[-,]it/i` | `isItalic` |
| Font family | map to Word-safe | Times→Times New Roman, Helvetica/Arial→Arial, Courier/mono→Courier New, strip `ABCDEF+` subset prefix, else base before `-`/`,` | `mapFontFamily` |
| Line grouping | cluster by y | tolerance = `0.5 × median font size` (not a fixed px) | `buildLines` |
| Intra-line spacing | gap between items | insert a space only when `gap > 0.25 × fontSize` | `lineToRuns` |
| Paragraph break | vertical gap | `gap > 1.5 × median line gap` starts a new paragraph | `extractPage` |
| Heading | relative font size | `>=1.8×` → H1, `>=1.45×` → H2, `>=1.2×` → H3 (median = page body) | `classifyLine` |
| Bullet list | leading glyph | `/^[•◦▪‣⁃*–-]\s+/`, marker stripped | `BULLET_RE` |
| Numbered list | leading token | `/^(\d+\|[a-z]\|[ivx]+)[.)]\s+/i`, single concrete numbering ref | `NUMBER_RE` |
| Alignment | box vs content box | both edges near margins → JUSTIFIED; centered within `5%` → CENTER; right edge near margin + large left indent → RIGHT; else LEFT | `classifyLine` |
| Indent | left x vs margin | left x `> commonLeft + 18pt` → `indent.left` (1pt = 20 twips) | `classifyLine` |
| Table columns | cluster item left-x | tolerance `4pt` | `detectTables` |
| Table block | consecutive rows | `>= 3` rows each hitting `>= 2` shared clusters; skipped otherwise (toggle) | `detectTables` |
| Images | operator list | walk `paintImageXObject` / `paintJpegXObject`, track CTM, resolve via `page.objs.get`, draw to canvas → PNG; failures skipped | `extractImages` |
| Image placement | CTM | drawn size = `hypot(ctm[0],ctm[1]) × hypot(ctm[2],ctm[3])`, y = `ctm[5] + height`, interleaved by y | `extractImages` |
| Hyperlinks | annotations | subtype `Link` + `url`; run overlaps rect → blue + underline `ExternalHyperlink` | `linkForItem` |
| Page size | viewport | `pt × 20` twips, orientation from aspect ratio | `buildDocx` |
| Margins | content bounds | min/max x/y of items, clamped to `0.4in–1.5in` (28.8–108pt) | `extractPage` |
| Two columns | center empty band | no item crosses `42%–58%` of width, ≥5 items each side; read left then right (toggle, off by default) | `detectColumns` |

Every detection step (`detectTables`, `detectColumns`, `extractImages`,
`classifyLine`) is wrapped in try/catch so a failure degrades to plain
paragraphs instead of aborting the export.

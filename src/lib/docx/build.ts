import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  LevelFormat,
  PageOrientation,
  type ISectionOptions,
  type IParagraphOptions,
} from "docx";
import type {
  PageBlocks,
  Block,
  ParagraphBlock,
  TableBlock,
  ImageBlock,
  RunSpec,
} from "./extract";

const pt = (v: number) => Math.round(v * 20); // points -> twips
const px = (v: number) => Math.round((v * 96) / 72); // points -> pixels

const NUM_REF = "pdf-num";

function runToChild(r: RunSpec) {
  const base = {
    text: r.text,
    bold: r.bold,
    italics: r.italic,
    font: r.font,
    size: Math.max(8, Math.round(r.size * 2)), // half-points
  };
  if (r.link) {
    return new ExternalHyperlink({
      link: r.link,
      children: [
        new TextRun({ ...base, color: "0000FF", underline: {} }),
      ],
    });
  }
  return new TextRun(base);
}

function headingLevel(h?: 1 | 2 | 3) {
  if (h === 1) return HeadingLevel.HEADING_1;
  if (h === 2) return HeadingLevel.HEADING_2;
  if (h === 3) return HeadingLevel.HEADING_3;
  return undefined;
}

function alignOf(a?: ParagraphBlock["align"]) {
  switch (a) {
    case "center":
      return AlignmentType.CENTER;
    case "right":
      return AlignmentType.RIGHT;
    case "justified":
      return AlignmentType.JUSTIFIED;
    default:
      return AlignmentType.LEFT;
  }
}

function paragraphBlock(b: ParagraphBlock): Paragraph {
  const opts: IParagraphOptions = {
    children: b.runs.map(runToChild),
    heading: headingLevel(b.heading),
    alignment: alignOf(b.align),
    ...(b.indentPt && !b.list ? { indent: { left: pt(b.indentPt) } } : {}),
    ...(b.list?.type === "bullet" ? { bullet: { level: b.list.level } } : {}),
    ...(b.list?.type === "number"
      ? { numbering: { reference: NUM_REF, level: b.list.level } }
      : {}),
  };
  return new Paragraph(opts);
}

function tableBlock(b: TableBlock): Table {
  const totalWidth = b.colWidths.reduce((a, c) => a + c, 0) || 1;
  const thin = { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thin,
      bottom: thin,
      left: thin,
      right: thin,
      insideHorizontal: thin,
      insideVertical: thin,
    },
    rows: b.rows.map(
      (row) =>
        new TableRow({
          children: b.colWidths.map(
            (cw, ci) =>
              new TableCell({
                width: {
                  size: Math.round((cw / totalWidth) * 100),
                  type: WidthType.PERCENTAGE,
                },
                children: [new Paragraph(row[ci] ?? "")],
              })
          ),
        })
    ),
  });
}

function imageBlock(b: ImageBlock, usableWidthPt: number): Paragraph {
  let wPt = b.widthPt;
  let hPt = b.heightPt;
  if (wPt > usableWidthPt && wPt > 0) {
    const scale = usableWidthPt / wPt;
    wPt = usableWidthPt;
    hPt = hPt * scale;
  }
  return new Paragraph({
    children: [
      new ImageRun({
        type: "png",
        data: b.png,
        transformation: { width: px(wPt), height: px(hPt) },
      }),
    ],
  });
}

function blockToElement(b: Block, usableWidthPt: number) {
  if (b.kind === "table") return tableBlock(b);
  if (b.kind === "image") return imageBlock(b, usableWidthPt);
  return paragraphBlock(b);
}

export async function buildDocx(pages: PageBlocks[]): Promise<Blob> {
  const sections: ISectionOptions[] = pages.map((pg) => {
    const usableWidthPt = pg.widthPt - pg.margin.left - pg.margin.right;
    const children = pg.blocks.map((b) => {
      try {
        return blockToElement(b, usableWidthPt);
      } catch {
        // degrade any failed block to plain text
        if (b.kind === "paragraph")
          return new Paragraph(b.runs.map((r) => r.text).join(""));
        return new Paragraph("");
      }
    });
    return {
      properties: {
        page: {
          size: {
            width: pt(pg.widthPt),
            height: pt(pg.heightPt),
            orientation: pg.landscape
              ? PageOrientation.LANDSCAPE
              : PageOrientation.PORTRAIT,
          },
          margin: {
            top: pt(pg.margin.top),
            right: pt(pg.margin.right),
            bottom: pt(pg.margin.bottom),
            left: pt(pg.margin.left),
          },
        },
      },
      children: children.length ? children : [new Paragraph("")],
    };
  });

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUM_REF,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720 * (level + 1), hanging: 360 },
              },
            },
          })),
        },
      ],
    },
    sections,
  });

  return Packer.toBlob(doc);
}

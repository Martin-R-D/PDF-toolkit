import {
  Merge,
  Scissors,
  RotateCw,
  ArrowUpDown,
  Minimize2,
  Stamp,
  Image,
  FileImage,
  PenTool,
  GitCompare,
  ScanText,
  FileType,
  type LucideIcon,
} from "lucide-react";

export interface Tool {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const tools: Tool[] = [
  {
    href: "/merge",
    title: "Merge PDFs",
    description: "Combine multiple PDFs into one file",
    icon: Merge,
  },
  {
    href: "/split",
    title: "Split PDF",
    description: "Extract pages or split into several files",
    icon: Scissors,
  },
  {
    href: "/rotate",
    title: "Rotate Pages",
    description: "Fix page orientation",
    icon: RotateCw,
  },
  {
    href: "/reorder",
    title: "Reorder & Delete",
    description: "Drag pages into a new order",
    icon: ArrowUpDown,
  },
  {
    href: "/compress",
    title: "Compress PDF",
    description: "Shrink file size",
    icon: Minimize2,
  },
  {
    href: "/watermark",
    title: "Add Watermark",
    description: "Stamp text or an image on pages",
    icon: Stamp,
  },
  {
    href: "/pdf-to-image",
    title: "PDF to Image",
    description: "Export pages as PNG or JPG",
    icon: Image,
  },
  {
    href: "/image-to-pdf",
    title: "Image to PDF",
    description: "Turn images into a PDF",
    icon: FileImage,
  },
  {
    href: "/editor",
    title: "PDF Editor",
    description: "Add text, images, shapes and redactions",
    icon: PenTool,
  },
  {
    href: "/compare",
    title: "Compare PDFs",
    description: "Highlight text and visual changes between two files",
    icon: GitCompare,
  },
  {
    href: "/ocr",
    title: "OCR Scanner",
    description: "Make scanned PDFs searchable",
    icon: ScanText,
  },
  {
    href: "/pdf-to-docx",
    title: "PDF to Word",
    description: "Export text to an editable DOCX",
    icon: FileType,
  },
];

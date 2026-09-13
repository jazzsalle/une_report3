"use client";
// DOCX 내보내기 (UFR-008-007) — Markdown 블록(IR) → docx. HWPX 와 동일한 ExportDoc 입력을 사용한다.
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, BorderStyle } from "docx";
import { downloadBlob } from "@/lib/utils";
import { parseMarkdown, type MdBlock, type MdInline } from "./markdown";
import type { ExportDoc } from "./hwpx";

const FONT = "Malgun Gothic";

function runs(inlines: MdInline[], size = 21, prefix = ""): TextRun[] {
  return inlines.map((i, idx) => new TextRun({ text: (idx === 0 ? prefix : "") + i.text, bold: i.bold, italics: i.italic, size, font: FONT }));
}

function p(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing?: number } = {}) {
  return new Paragraph({ alignment: opts.align, spacing: { after: opts.spacing ?? 80 }, children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 21, font: FONT })] });
}

const borders = { top: { style: BorderStyle.SINGLE, size: 4, color: "999999" }, bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" }, left: { style: BorderStyle.SINGLE, size: 4, color: "999999" }, right: { style: BorderStyle.SINGLE, size: 4, color: "999999" }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB" } };

function metaTable(meta: [string, string][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      new TableRow({ children: meta.map(([k]) => new TableCell({ shading: { fill: "EEF3FA" }, children: [p(k, { bold: true, size: 19, align: AlignmentType.CENTER })] })) }),
      new TableRow({ children: meta.map(([, v]) => new TableCell({ children: [p(v, { size: 19, align: AlignmentType.CENTER })] })) }),
    ],
  });
}

function mdTable(header: MdInline[][], rows: MdInline[][][]) {
  const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const row = (cells: MdInline[][], head: boolean) =>
    new TableRow({
      tableHeader: head,
      children: Array.from({ length: cols }, (_, i) => new TableCell({ shading: head ? { fill: "EEF3FA" } : undefined, children: [new Paragraph({ alignment: head ? AlignmentType.CENTER : undefined, spacing: { after: 40 }, children: runs(cells[i] ?? [{ text: "" }], 19).map((r) => (head ? new TextRun({ ...(r as unknown as { options: object }).options, bold: true }) : r)) })] })),
    });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders, rows: [row(header, true), ...rows.map((r) => row(r, false))] });
}

function blocksToDocx(blocks: MdBlock[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let chapter = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        if (b.level <= 2) {
          chapter++;
          out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: `${chapter}. ${b.inlines.map((i) => i.text).join("")}`, bold: true, size: 26, font: FONT, color: "163A67" })] }));
        } else out.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: runs(b.inlines.map((i) => ({ ...i, bold: true })), 22, "□ ") }));
        break;
      case "paragraph":
        out.push(new Paragraph({ spacing: { after: 80 }, children: runs(b.inlines, 21, "□ ") }));
        break;
      case "quote":
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: runs(b.inlines, 19, "<"), }));
        break;
      case "hr":
        out.push(p("", { spacing: 120 }));
        break;
      case "list":
        b.items.forEach((it) => {
          const prefix = it.level === 0 ? (b.ordered ? `${it.index}) ` : "○ ") : it.level === 1 ? "- " : "· ";
          out.push(new Paragraph({ indent: { left: 360 + it.level * 360 }, spacing: { after: 60 }, children: runs(it.inlines, 21, prefix) }));
        });
        break;
      case "table":
        out.push(mdTable(b.header, b.rows));
        out.push(p("", { spacing: 60 }));
        break;
    }
  }
  return out;
}

export async function exportDocx(doc: ExportDoc) {
  const children: (Paragraph | Table)[] = [
    p(doc.title, { bold: true, size: 40, align: AlignmentType.CENTER, spacing: 120 }),
    p(doc.subtitle, { size: 24, align: AlignmentType.CENTER, spacing: 240 }),
  ];
  if (doc.meta.length) {
    children.push(metaTable(doc.meta));
    children.push(p("", { spacing: 160 }));
  }
  children.push(...blocksToDocx(parseMarkdown(doc.markdown)));
  const d = new Document({ styles: { default: { document: { run: { font: FONT, size: 21 } } } }, sections: [{ children }] });
  const blob = await Packer.toBlob(d);
  downloadBlob(blob, doc.filename.endsWith(".docx") ? doc.filename : `${doc.filename}.docx`);
}

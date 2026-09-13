"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  HWPX 내보내기 — `public/templates/report-template.hwpx`(AI 행정문서 템플릿)의
//  용지·스타일(header.xml)·문단/글자 모양 ID 를 그대로 사용하고 본문(section0.xml)만
//  Markdown 으로부터 재구성한다. 결과는 OWPML 패키지 규칙(mimetype STORED 첫 항목)을 지켜
//  한컴오피스에서 열린다.
//
//  템플릿 스타일 매핑 (AI 행정문서 템플릿 기준)
//   · 제목        paraPr 20(가운데) + charPr 9  (20pt)
//   · 부제        paraPr 20         + charPr 8  (15pt)  "보고유형 / 일자 / 작성자"
//   · 장 제목     paraPr 21(왼쪽)   + charPr 10 (15pt 굵게)  "1. 제목"
//   · 본문 □      paraPr 21         + charPr 7  (13pt)  / 굵게는 charPr 14(신규, 7 복제 + bold)
//   · 하위 ○ / -  같은 본문 모양에 접두어만 다르게
//   · 캡션(인용)  paraPr 20         + charPr 12 (11pt 굵게)
//   · 표          tbl borderFill 3 · 머리 셀 borderFill 4 / charPr 12 · 본문 셀 charPr 13
// ─────────────────────────────────────────────────────────────────────────────
import JSZip from "jszip";
import { downloadBlob } from "@/lib/utils";
import { parseMarkdown, plain, type MdBlock, type MdInline } from "./markdown";

export interface ExportDoc {
  title: string;
  subtitle: string;
  meta: [string, string][];
  markdown: string;
  filename: string;
}

const TEMPLATE_URL = "/templates/report-template.hwpx";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const P_ATTR = 'id="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"';

function run(charPr: number, text: string) {
  return text ? `<hp:run charPrIDRef="${charPr}"><hp:t>${esc(text)}</hp:t></hp:run>` : `<hp:run charPrIDRef="${charPr}"/>`;
}

function para(paraPr: number, runs: string) {
  return `<hp:p ${P_ATTR} paraPrIDRef="${paraPr}">${runs}</hp:p>`;
}

/** 인라인(굵게 포함)을 run 열로 — 기본 charPr / 굵게 charPr */
function inlineRuns(inlines: MdInline[], normal: number, bold: number, prefix = "") {
  const parts: string[] = [];
  inlines.forEach((i, idx) => {
    const text = (idx === 0 ? prefix : "") + i.text;
    if (!text) return;
    parts.push(run(i.bold ? bold : normal, text));
  });
  return parts.length ? parts.join("") : run(normal, prefix);
}

/** 표 생성 — 템플릿 표 규격(총폭 47624, 행높이 1948, 안여백 510/141) */
function table(header: MdInline[][], rows: MdInline[][][]) {
  const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const totalW = 47624;
  const colW = Math.floor(totalW / cols);
  const rowH = 1948;
  const allRows = [header, ...rows];
  const cell = (inl: MdInline[] | undefined, c: number, r: number, isHead: boolean) => {
    const bf = isHead ? 4 : 3;
    const cp = isHead ? 12 : 13;
    const content = inl && plain(inl) ? inlineRuns(inl, cp, 12) : `<hp:run charPrIDRef="${cp}"/>`;
    return `<hp:tc name="" header="${isHead ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${bf}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${para(isHead ? 20 : 21, content)}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${colW}" height="${rowH}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
  };
  const trs = allRows.map((r, ri) => `<hp:tr>${Array.from({ length: cols }, (_, ci) => cell(r[ci], ci, ri, ri === 0)).join("")}</hp:tr>`).join("");
  const tbl = `<hp:tbl id="${Math.floor(Math.random() * 1e9)}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${allRows.length}" colCnt="${cols}" cellSpacing="0" borderFillIDRef="3" noAdjust="0"><hp:sz width="${colW * cols}" widthRelTo="ABSOLUTE" height="${rowH * allRows.length}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${trs}</hp:tbl>`;
  return para(20, `<hp:run charPrIDRef="8">${tbl}<hp:t/></hp:run>`);
}

const BLANK = para(21, run(8, ""));
const BOLD_BODY = 14; // header.xml 에 추가하는 굵은 본문 charPr

/** Markdown 블록 → 행정문서 문단 (□ ○ - 체계) */
function blocksToParas(blocks: MdBlock[]): string[] {
  const out: string[] = [];
  let chapter = 0;
  for (const b of blocks) {
    switch (b.type) {
      case "heading": {
        if (b.level <= 2) {
          chapter++;
          if (out.length) out.push(BLANK);
          out.push(para(21, run(10, `${chapter}. ${plain(b.inlines)}`)));
        } else {
          out.push(para(21, run(BOLD_BODY, `  □ ${plain(b.inlines)}`)));
        }
        break;
      }
      case "paragraph":
        out.push(para(21, inlineRuns(b.inlines, 7, BOLD_BODY, "  □ ")));
        break;
      case "quote":
        out.push(para(20, run(12, `<${plain(b.inlines)}>`)));
        break;
      case "hr":
        out.push(BLANK);
        break;
      case "list":
        b.items.forEach((it) => {
          const prefix = it.level === 0 ? (b.ordered ? `   ${it.index}) ` : "   ○ ") : it.level === 1 ? "     - " : "       · ";
          out.push(para(21, inlineRuns(it.inlines, 7, BOLD_BODY, prefix)));
        });
        break;
      case "table":
        out.push(table(b.header, b.rows));
        break;
    }
  }
  return out;
}

/** header.xml 에 굵은 본문 charPr(id 14 = charPr 7 + bold) 추가 */
function patchHeader(header: string): string {
  if (/<hh:charPr id="14"/.test(header)) return header;
  const m = /<hh:charPr id="7"[\s\S]*?<\/hh:charPr>/.exec(header);
  if (!m) return header;
  const bold = m[0].replace('id="7"', `id="${BOLD_BODY}"`).replace("<hh:underline", "<hh:bold/><hh:underline");
  return header.replace(/<hh:charProperties itemCnt="(\d+)">/, (_, n) => `<hh:charProperties itemCnt="${Number(n) + 1}">`).replace(m[0], m[0] + bold);
}

export async function exportHwpx(doc: ExportDoc) {
  const res = await fetch(TEMPLATE_URL, { cache: "force-cache" });
  if (!res.ok) throw new Error(`템플릿을 불러올 수 없습니다 (${res.status})`);
  const tpl = await JSZip.loadAsync(await res.arrayBuffer());

  const section = await tpl.file("Contents/section0.xml")!.async("string");
  const header = await tpl.file("Contents/header.xml")!.async("string");

  // 섹션 루트(네임스페이스 선언) + 첫 문단의 secPr/colPr run 보존
  const rootOpen = section.slice(0, section.indexOf("<hp:p "));
  const secPrRun = /<hp:run charPrIDRef="\d+"><hp:secPr[\s\S]*?<\/hp:secPr>[\s\S]*?<\/hp:run>/.exec(section)?.[0] ?? "";

  const paras: string[] = [];
  paras.push(`<hp:p id="3121190098" paraPrIDRef="20" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${secPrRun}${run(9, doc.title)}</hp:p>`);
  paras.push(para(20, run(8, doc.subtitle)));
  paras.push(BLANK);
  if (doc.meta.length) {
    paras.push(table(doc.meta.map(([k]) => [{ text: k }]), [doc.meta.map(([, v]) => [{ text: v }])]));
    paras.push(BLANK);
  }
  paras.push(...blocksToParas(parseMarkdown(doc.markdown)));
  paras.push(BLANK);

  const newSection = `${rootOpen}${paras.join("")}</hs:sec>`;
  const prv = [doc.title, doc.subtitle, "", ...paras.map(() => "")].join("\n").slice(0, 2000);

  // 패키지 재조립 — mimetype 은 반드시 첫 항목 · STORED
  const out = new JSZip();
  out.file("mimetype", await tpl.file("mimetype")!.async("uint8array"), { compression: "STORE" });
  for (const [name, entry] of Object.entries(tpl.files)) {
    if (entry.dir || name === "mimetype") continue;
    if (name === "Contents/section0.xml") out.file(name, newSection, { compression: "DEFLATE" });
    else if (name === "Contents/header.xml") out.file(name, patchHeader(header), { compression: "DEFLATE" });
    else if (name === "Preview/PrvText.txt") out.file(name, prv, { compression: "DEFLATE" });
    else if (name === "Contents/content.hpf") {
      const hpf = (await entry.async("string")).replace(/<opf:title>.*?<\/opf:title>/, `<opf:title>${esc(doc.title)}</opf:title>`);
      out.file(name, hpf, { compression: "DEFLATE" });
    } else out.file(name, await entry.async("uint8array"), { compression: "DEFLATE" });
  }
  const blob = await out.generateAsync({ type: "blob", mimeType: "application/hwp+zip" });
  downloadBlob(blob, doc.filename.endsWith(".hwpx") ? doc.filename : `${doc.filename}.hwpx`);
}

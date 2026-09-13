// ─────────────────────────────────────────────────────────────────────────────
//  경량 Markdown 블록 파서 — DOCX / HWPX 내보내기 공용 중간표현(IR)
//  지원: 제목(#~######), 단락, 불릿(-, *, +) 들여쓰기 2단계, 번호 목록, 표(GFM), 인용(>), 구분선, 굵게/기울임 제거
// ─────────────────────────────────────────────────────────────────────────────

export type MdInline = { text: string; bold?: boolean; italic?: boolean };

export type MdBlock =
  | { type: "heading"; level: number; inlines: MdInline[] }
  | { type: "paragraph"; inlines: MdInline[] }
  | { type: "list"; ordered: boolean; items: { level: number; inlines: MdInline[]; index?: number }[] }
  | { type: "table"; header: MdInline[][]; rows: MdInline[][][] }
  | { type: "quote"; inlines: MdInline[] }
  | { type: "hr" };

/** **굵게** / *기울임* / `코드` 를 인라인 런으로 분해 */
export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) out.push({ text: m[2] ?? m[3], bold: true });
    else if (m[4] !== undefined || m[5] !== undefined) out.push({ text: m[4] ?? m[5], italic: true });
    else if (m[6] !== undefined) out.push({ text: m[6] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last) });
  return out.length ? out : [{ text: "" }];
}

export function plain(inlines: MdInline[]): string {
  return inlines.map((i) => i.text).join("");
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdown(md: string): MdBlock[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let i = 0;
  const flushPara = (buf: string[]) => {
    if (buf.length) blocks.push({ type: "paragraph", inlines: parseInline(buf.join(" ")) });
    buf.length = 0;
  };
  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      flushPara(para);
      i++;
      continue;
    }
    // 구분선
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushPara(para);
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    // 제목
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      flushPara(para);
      blocks.push({ type: "heading", level: h[1].length, inlines: parseInline(h[2].replace(/\s#+$/, "")) });
      i++;
      continue;
    }
    // 인용
    if (t.startsWith(">")) {
      flushPara(para);
      const q: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        q.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", inlines: parseInline(q.join(" ")) });
      continue;
    }
    // 표 (헤더 + 구분행)
    if (t.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushPara(para);
      const header = splitRow(t).map(parseInline);
      i += 2;
      const rows: MdInline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]).map(parseInline));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }
    // 목록 (불릿 / 번호)
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara(para);
      const ordered = /\d/.test(li[2]);
      const items: { level: number; inlines: MdInline[]; index?: number }[] = [];
      let n = 0;
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) {
          // 목록 항목의 이어지는 줄(들여쓰기된 일반 텍스트)
          if (items.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*$/.test(lines[i])) {
            const lastItem = items[items.length - 1];
            lastItem.inlines = [...lastItem.inlines, { text: " " + lines[i].trim() }];
            i++;
            continue;
          }
          break;
        }
        const indent = m[1].replace(/\t/g, "  ").length;
        const level = Math.min(2, Math.floor(indent / 2));
        n++;
        items.push({ level, inlines: parseInline(m[3]), index: /\d/.test(m[2]) ? parseInt(m[2], 10) : n });
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }
    para.push(t);
    i++;
  }
  flushPara(para);
  return blocks;
}

/** 마크다운을 단순 텍스트로 (미리보기·PrvText 용) */
export function markdownToPlain(md: string): string {
  return parseMarkdown(md)
    .map((b) => {
      switch (b.type) {
        case "heading":
          return plain(b.inlines);
        case "paragraph":
        case "quote":
          return plain(b.inlines);
        case "list":
          return b.items.map((it) => `${"  ".repeat(it.level)}${b.ordered ? `${it.index}. ` : "- "}${plain(it.inlines)}`).join("\n");
        case "table":
          return [b.header, ...b.rows].map((r) => r.map(plain).join(" | ")).join("\n");
        case "hr":
          return "―";
      }
    })
    .join("\n");
}

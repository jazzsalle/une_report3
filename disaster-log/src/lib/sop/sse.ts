// ─────────────────────────────────────────────────────────────────────────────
//  SSE 파서 — UNI RAG /chat/json 계약 (API 가이드 5절)
//  1) data: 로 시작하는 줄만 처리  2) "data: " 뒤 공백 1개 제거
//  3) [DONE] 이면 종료            4) 나머지는 JSON
// ─────────────────────────────────────────────────────────────────────────────

export type SseEvent =
  | { kind: "status"; value: string }
  | { kind: "thinking"; value: string }
  | { kind: "compn"; value: unknown }
  | { kind: "sources"; value: unknown[] }
  | { kind: "done"; value: unknown }
  | { kind: "error"; value: string }
  | { kind: "text"; value: string }
  | { kind: "raw"; value: unknown }
  | { kind: "end" };

export function parseSseLine(line: string): SseEvent | null {
  if (!line.startsWith("data:")) return null;
  const payload = line.length > 5 && line[5] === " " ? line.slice(6) : line.slice(5);
  if (payload === "[DONE]") return { kind: "end" };
  let obj: unknown;
  try {
    obj = JSON.parse(payload);
  } catch {
    return { kind: "text", value: payload };
  }
  if (typeof obj === "string") return { kind: "text", value: obj };
  if (obj && typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    if ("__compn__" in o) return { kind: "compn", value: o.__compn__ };
    if ("__status__" in o) return { kind: "status", value: String(o.__status__) };
    if ("__thinking__" in o) return { kind: "thinking", value: String(o.__thinking__) };
    if ("__sources__" in o) return { kind: "sources", value: (o.__sources__ as unknown[]) ?? [] };
    if ("__done__" in o) return { kind: "done", value: o.__done__ };
    if ("__error__" in o) return { kind: "error", value: String(o.__error__) };
    // 일반 챗 스트림 — 토큰 필드 후보들을 유연하게 수용
    for (const key of ["__token__", "__answer__", "__content__", "token", "answer", "content", "text", "delta", "message"]) {
      if (key in o && typeof o[key] === "string") return { kind: "text", value: o[key] as string };
    }
    // OpenAI 호환 형식
    const choices = o.choices as Array<{ delta?: { content?: string }; text?: string }> | undefined;
    if (Array.isArray(choices) && choices[0]) {
      const c = choices[0];
      const v = c.delta?.content ?? c.text;
      if (typeof v === "string") return { kind: "text", value: v };
    }
    return { kind: "raw", value: o };
  }
  return { kind: "raw", value: obj };
}

/** ReadableStream(Uint8Array) 을 라인 단위 SSE 이벤트로 변환 */
export async function* iterateSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        if (!line || line.startsWith(":")) continue;
        const ev = parseSseLine(line);
        if (ev) {
          yield ev;
          if (ev.kind === "end") return;
        }
      }
    }
    if (buf.trim()) {
      const ev = parseSseLine(buf.trim());
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

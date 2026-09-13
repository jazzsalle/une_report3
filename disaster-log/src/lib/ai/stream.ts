"use client";
// 브라우저에서 /api/uni/* SSE 응답을 소비하는 헬퍼
import { iterateSse, type SseEvent } from "@/lib/sop/sse";
import type { AiContext } from "@/lib/uni/prompts";

export interface StreamMeta {
  source: "uni" | "fallback";
  model?: string;
  reason?: string;
}

export interface ChatHandlers {
  onMeta?: (m: StreamMeta) => void;
  onStatus?: (s: string) => void;
  onText: (t: string) => void;
  onError?: (e: string) => void;
}

export async function streamDraft(kind: "log" | "report", context: AiContext, h: ChatHandlers, signal?: AbortSignal) {
  const res = await fetch("/api/uni/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, context }), signal });
  if (!res.ok || !res.body) throw new Error(`초안 생성 요청 실패 (${res.status})`);
  for await (const ev of iterateSse(res.body)) {
    handleCommon(ev, h);
    if (ev.kind === "text") h.onText(ev.value);
    if (ev.kind === "end") break;
  }
}

export interface SopHandlers {
  onMeta?: (m: StreamMeta) => void;
  onStatus?: (s: string) => void;
  onCompn: (compn: unknown, action?: unknown) => void;
  onError?: (e: string) => void;
  onThinking?: (t: string) => void;
}

export async function streamSopGeneration(query: string, hints: { disasterType?: string; organization?: string }, h: SopHandlers, signal?: AbortSignal) {
  const res = await fetch("/api/uni/sop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, hints }), signal });
  if (!res.ok || !res.body) throw new Error(`SOP 생성 요청 실패 (${res.status})`);
  for await (const ev of iterateSse(res.body)) {
    handleCommon(ev, h);
    if (ev.kind === "compn") h.onCompn(ev.value);
    else if (ev.kind === "thinking") h.onThinking?.(ev.value);
    else if (ev.kind === "raw") {
      const o = ev.value as Record<string, unknown>;
      if ("__compn__" in o) h.onCompn(o.__compn__, o.__action__);
    }
    if (ev.kind === "end") break;
  }
}

function handleCommon(ev: SseEvent, h: { onMeta?: (m: StreamMeta) => void; onStatus?: (s: string) => void; onError?: (e: string) => void }) {
  if (ev.kind === "raw") {
    const o = ev.value as Record<string, unknown>;
    if ("__meta__" in o) h.onMeta?.(o.__meta__ as StreamMeta);
  } else if (ev.kind === "status") h.onStatus?.(ev.value);
  else if (ev.kind === "error") h.onError?.(ev.value);
}

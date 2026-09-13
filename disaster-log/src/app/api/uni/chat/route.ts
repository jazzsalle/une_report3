// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/uni/chat — 상황일지·결과보고 초안 (일반 UNI 챗 API → SSE 릴레이)
//  body: { kind: "log" | "report", context: AiContext }
//  응답: text/event-stream
//    data: {"__meta__":{"source":"uni"|"fallback","model":"..."}}
//    data: {"__status__":"generating"}
//    data: {"text":"..."}   ← 토큰
//    data: {"__error__":"..."}
//    data: [DONE]
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { getConfig, streamChat } from "@/lib/uni/client";
import { iterateSse } from "@/lib/sop/sse";
import { fallbackLog, fallbackReport } from "@/lib/uni/fallback";
import { logSystemPrompt, logUserPrompt, reportSystemPrompt, reportUserPrompt, type AiContext } from "@/lib/uni/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const enc = new TextEncoder();
const send = (ctrl: ReadableStreamDefaultController<Uint8Array>, obj: unknown) => ctrl.enqueue(enc.encode(`data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`));

async function streamFallback(ctrl: ReadableStreamDefaultController<Uint8Array>, text: string, reason: string) {
  send(ctrl, { __meta__: { source: "fallback", model: "local-rule-based", reason } });
  send(ctrl, { __status__: "generating" });
  // 문장 단위로 잘라 실시간 생성처럼 전달
  const chunks = text.match(/[^\n]*\n|[^\n]+$/g) ?? [text];
  for (const c of chunks) {
    send(ctrl, { text: c });
    await new Promise((r) => setTimeout(r, 18));
  }
  send(ctrl, { __status__: "end" });
  send(ctrl, "[DONE]");
}

export async function POST(req: NextRequest) {
  const { kind, context } = (await req.json()) as { kind: "log" | "report"; context: AiContext };
  const cfg = getConfig();
  const system = kind === "log" ? logSystemPrompt() : reportSystemPrompt();
  const user = kind === "log" ? logUserPrompt(context) : reportUserPrompt(context);
  const fallbackText = () => (kind === "log" ? fallbackLog(context) : fallbackReport(context));

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        const { res, model } = await streamChat(`${system}\n\n${user}`, system);
        send(ctrl, { __meta__: { source: "uni", model } });
        let gotText = false;
        for await (const ev of iterateSse(res.body!)) {
          if (ev.kind === "text") {
            gotText = true;
            send(ctrl, { text: ev.value });
          } else if (ev.kind === "status") send(ctrl, { __status__: ev.value });
          else if (ev.kind === "error") send(ctrl, { __error__: ev.value });
          else if (ev.kind === "sources") {
            /* 사내 문서 발췌 — 외부 화면 노출 금지(가이드 7절) → 전달하지 않음 */
          } else if (ev.kind === "raw" && !gotText) {
            // 알 수 없는 계약: 문자열 필드가 있으면 텍스트로 간주
            const o = ev.value as Record<string, unknown>;
            const str = Object.values(o).find((v) => typeof v === "string");
            if (str) send(ctrl, { text: str as string });
          } else if (ev.kind === "end") break;
        }
        if (!gotText && cfg.fallback) {
          await streamFallback(ctrl, fallbackText(), "UNI 응답에 텍스트가 없어 로컬 초안으로 대체");
        } else {
          send(ctrl, { __status__: "end" });
          send(ctrl, "[DONE]");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (cfg.fallback) {
          await streamFallback(ctrl, fallbackText(), msg);
        } else {
          send(ctrl, { __error__: msg });
          send(ctrl, "[DONE]");
        }
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}

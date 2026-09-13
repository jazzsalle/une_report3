// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/uni/sop — SOP 자동생성 (UNI /chat/json SSE → 브라우저 SSE 릴레이)
//  기존 모듈(GetLLMSopFlowChart)의 SignalR 릴레이를 Vercel 친화적인 SSE 직접 릴레이로 치환.
//  body: { query: string, top_k?: number, hints?: { disasterType, organization } }
//  응답 이벤트: __meta__ / __status__ / __compn__(CompnSaveParams PascalCase) / __error__ / [DONE]
//  접속 불가 시(UNI_FALLBACK=true) Seed 조치로 로컬 생성하여 동일 계약으로 스트리밍.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest } from "next/server";
import { getConfig, streamSop } from "@/lib/uni/client";
import { iterateSse } from "@/lib/sop/sse";
import { actionsToCompns } from "@/lib/sop/adapter";
import { FLOOD_ACTIONS } from "@/lib/seed/flood";
import { WILDFIRE_ACTIONS } from "@/lib/seed/wildfire";
import type { RecommendedAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const enc = new TextEncoder();
const send = (ctrl: ReadableStreamDefaultController<Uint8Array>, obj: unknown) => ctrl.enqueue(enc.encode(`data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`));

function localActions(query: string, disasterType?: string): RecommendedAction[] {
  const pool = disasterType === "wildfire" || /산불/.test(query) ? WILDFIRE_ACTIONS : FLOOD_ACTIONS;
  const kws = query.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2);
  const scored = pool.map((a) => {
    const text = `${a.title} ${a.summary} ${a.stage} ${a.leadDept} ${a.details.join(" ")}`;
    let s = 0;
    for (const k of kws) if (text.includes(k)) s += 2;
    if (/경보|심각|침수|대피|인명/.test(query) && a.stage === "비상대응") s += 1.5;
    if (/주의보|예비특보/.test(query) && a.stage === "초기대응") s += 1.5;
    if (/해제|복구|피해조사|이재민/.test(query) && a.stage === "수습·복구") s += 2;
    if (/^(4-1|5-1|5-2|6-1|6-2|6-3|가-1|가-2|나-1|나-2)$/.test(a.code)) s += 1;
    return { a, s };
  });
  const picked = scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.a);
  const fallback = pool.filter((a) => a.stage === "초기대응").slice(0, 6);
  const list = picked.length >= 3 ? picked : [...picked, ...fallback.filter((f) => !picked.includes(f))].slice(0, 6);
  const order = ["징후감지", "초기대응", "비상대응", "수습·복구"];
  return list.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
}

async function streamLocal(ctrl: ReadableStreamDefaultController<Uint8Array>, query: string, organization: string, disasterType: string | undefined, reason: string) {
  send(ctrl, { __meta__: { source: "fallback", model: "local-seed", reason } });
  send(ctrl, { __status__: "searching" });
  await new Promise((r) => setTimeout(r, 500));
  send(ctrl, { __status__: "reranking" });
  await new Promise((r) => setTimeout(r, 400));
  send(ctrl, { __status__: "generating" });
  const actions = localActions(query, disasterType);
  const compns = actionsToCompns(actions, organization);
  for (let i = 0; i < compns.length; i++) {
    send(ctrl, { __compn__: compns[i], __action__: i >= 1 && i <= actions.length ? actions[i - 1] : null });
    await new Promise((r) => setTimeout(r, 260));
  }
  send(ctrl, { __done__: { filename: "local-seed", count: compns.length } });
  send(ctrl, { __status__: "end" });
  send(ctrl, "[DONE]");
}

export async function POST(req: NextRequest) {
  const { query, top_k, hints } = (await req.json()) as { query: string; top_k?: number; hints?: { disasterType?: string; organization?: string } };
  const cfg = getConfig();
  const org = hints?.organization ?? "재난안전대책본부";

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        const { res, model } = await streamSop(query, top_k ?? 5);
        send(ctrl, { __meta__: { source: "uni", model } });
        let count = 0;
        for await (const ev of iterateSse(res.body!)) {
          if (ev.kind === "compn") {
            count++;
            send(ctrl, { __compn__: ev.value });
          } else if (ev.kind === "status") send(ctrl, { __status__: ev.value });
          else if (ev.kind === "thinking") send(ctrl, { __thinking__: ev.value });
          else if (ev.kind === "error") send(ctrl, { __error__: ev.value });
          else if (ev.kind === "done") send(ctrl, { __done__: ev.value });
          else if (ev.kind === "end") break;
          // __sources__ 는 사내 문서 발췌 포함 → 전달 제외 (원본 모듈과 동일)
        }
        if (count === 0 && cfg.fallback) {
          await streamLocal(ctrl, query, org, hints?.disasterType, "UNI 응답에 컴포넌트가 없어 로컬 Seed 생성으로 대체");
        } else {
          send(ctrl, { __status__: "end" });
          send(ctrl, "[DONE]");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (cfg.fallback) await streamLocal(ctrl, query, org, hints?.disasterType, msg);
        else {
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

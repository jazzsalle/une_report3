import { NextResponse } from "next/server";
import { addAck, backend, getPayload } from "@/lib/dispatch/server-store";
import type { DispatchAckKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 토큰의 payload 조회 (링크에 ?p= 가 없을 때) */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = await getPayload(token);
  if (!p) return NextResponse.json({ ok: false, error: "not found", backend }, { status: 404 });
  return NextResponse.json({ ok: true, payload: p, backend });
}

/** 현장 요원 응답 — 수신확인 / 임무완료 / 조치사항 */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    const body = (await req.json()) as { kind: DispatchAckKind; note?: string; at?: string; situationId?: string };
    if (!["received", "completed", "note"].includes(body?.kind)) return NextResponse.json({ ok: false, error: "bad kind" }, { status: 400 });
    const ok = await addAck(token, { kind: body.kind, at: body.at ?? new Date().toISOString(), note: body.note?.slice(0, 2000) }, body.situationId);
    return NextResponse.json({ ok, backend }, { status: ok ? 200 : 404 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

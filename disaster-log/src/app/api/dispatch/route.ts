import { NextResponse } from "next/server";
import { backend, savePayloads } from "@/lib/dispatch/server-store";
import type { DispatchPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 발송 등록 — 모바일 페이지가 payload 없이(짧은 링크) 열릴 때를 위해 토큰별 payload 를 저장 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { situationId: string; payloads: DispatchPayload[] };
    if (!body?.situationId || !Array.isArray(body.payloads)) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    await savePayloads(body.situationId, body.payloads);
    return NextResponse.json({ ok: true, backend, count: body.payloads.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, backend }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, backend });
}

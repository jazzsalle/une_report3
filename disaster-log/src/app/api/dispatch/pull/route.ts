import { NextResponse } from "next/server";
import { backend, listAcks } from "@/lib/dispatch/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 상황실 브라우저 폴링 — 상황(situationId)의 응답 목록 (since 이후) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const sid = u.searchParams.get("situationId");
  const since = u.searchParams.get("since") ?? undefined;
  if (!sid) return NextResponse.json({ ok: false, error: "situationId required" }, { status: 400 });
  try {
    const acks = await listAcks(sid, since);
    return NextResponse.json({ ok: true, acks, backend, now: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, backend }, { status: 500 });
  }
}

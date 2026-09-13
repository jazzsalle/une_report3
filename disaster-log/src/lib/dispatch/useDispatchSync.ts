"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  상황실 브라우저 — 현장 요원 응답 수신
//  · BroadcastChannel / storage 이벤트: 같은 브라우저에서 모바일 페이지를 연 경우(시연) 즉시 반영
//  · 서버 폴링(/api/dispatch/pull): 휴대폰 등 다른 기기의 응답. 미완료 수신자가 있을 때만 4초 간격
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { DispatchAck, Situation } from "@/lib/types";

const POLL_MS = 4000;

export function useDispatchSync(s: Situation | undefined) {
  const sid = s?.id;
  const pending = !!s?.dispatches?.some((d) => d.recipients.some((r) => !r.completedAt));
  const sinceRef = useRef<string | undefined>(undefined);

  // 같은 브라우저 이벤트
  useEffect(() => {
    if (!sid) return;
    const apply = (raw: unknown) => {
      const a = raw as DispatchAck & { sid?: string };
      if (!a || !a.token || !a.kind) return;
      if (a.sid && a.sid !== sid) return;
      useAppStore.getState().applyDispatchAck(sid, { token: a.token, kind: a.kind, at: a.at, note: a.note });
    };
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("dl-dispatch");
      bc.onmessage = (e) => apply(e.data);
    } catch {}
    const onStorage = (e: StorageEvent) => {
      if (e.key === "dl-dispatch-ack" && e.newValue) {
        try {
          apply(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [sid]);

  // 서버 폴링
  useEffect(() => {
    if (!sid || !pending) return;
    let alive = true;
    const tick = async () => {
      try {
        const q = new URLSearchParams({ situationId: sid });
        if (sinceRef.current) q.set("since", sinceRef.current);
        const r = await fetch(`/api/dispatch/pull?${q}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { ok: boolean; acks: DispatchAck[]; now: string };
        if (!alive || !j.ok) return;
        j.acks.forEach((a) => useAppStore.getState().applyDispatchAck(sid, a));
        // 서버 시각 기준으로 다음 폴링 범위 축소 (약간의 여유)
        sinceRef.current = new Date(new Date(j.now).getTime() - 2000).toISOString();
      } catch {}
    };
    const t0 = setTimeout(tick, 300);
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [sid, pending]);
}

"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  /m/[token] — 현장 요원 모바일 상황전파 페이지 (인증 없음)
//  payload 는 링크(?p=) 에서 읽고, 없으면 서버(/api/dispatch/[token]) 에서 조회한다.
//  응답은 서버 POST + BroadcastChannel/localStorage(같은 브라우저 시연용) 로 상황실에 전달된다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { decodePayload } from "@/lib/dispatch/payload";
import { MobileDispatchView, type MobileAckState } from "@/components/dispatch/MobileDispatchView";
import type { DispatchAckKind, DispatchPayload } from "@/lib/types";

const KEY = (t: string) => `dl-m:${t}`;

export default function MobileDispatchPage() {
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const [payload, setPayload] = useState<DispatchPayload | null | undefined>(undefined);
  const [state, setState] = useState<MobileAckState>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState<DispatchAckKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = sp.get("p");
    const fromLink = p ? decodePayload(p) : null;
    let alive = true;
    const load = async () => {
      if (fromLink && fromLink.t === token) {
        setPayload(fromLink);
      } else {
        try {
          const r = await fetch(`/api/dispatch/${token}`, { cache: "no-store" });
          const j = await r.json();
          if (alive) setPayload(j.ok ? (j.payload as DispatchPayload) : null);
        } catch {
          if (alive) setPayload(null);
        }
      }
      try {
        const saved = localStorage.getItem(KEY(token));
        if (saved && alive) {
          const s = JSON.parse(saved) as MobileAckState;
          setState(s);
          setNote(s.note ?? "");
        }
      } catch {}
    };
    const t0 = setTimeout(load, 0);
    return () => {
      alive = false;
      clearTimeout(t0);
    };
  }, [sp, token]);

  const send = async (kind: DispatchAckKind, extra?: { note?: string }) => {
    if (!payload) return;
    setSending(kind);
    setError(null);
    const at = new Date().toISOString();
    const ack = { token, kind, at, note: extra?.note, sid: payload.sid };
    // 1) 같은 브라우저(시연) — 상황실 탭에 즉시 전달
    try {
      new BroadcastChannel("dl-dispatch").postMessage(ack);
      localStorage.setItem("dl-dispatch-ack", JSON.stringify(ack));
    } catch {}
    // 2) 서버 — 다른 기기(휴대폰)에서 상황실로
    let ok = false;
    try {
      const r = await fetch(`/api/dispatch/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, at, note: extra?.note, situationId: payload.sid }) });
      ok = r.ok;
    } catch {}
    const next: MobileAckState = { ...state };
    if (kind === "received") next.receivedAt = at;
    if (kind === "completed") {
      next.completedAt = at;
      if (!next.receivedAt) next.receivedAt = at;
    }
    if (kind === "note") {
      next.note = extra?.note ?? "";
      next.noteAt = at;
    }
    setState(next);
    try {
      localStorage.setItem(KEY(token), JSON.stringify(next));
    } catch {}
    if (!ok) setError("상황실 서버에 바로 전달되지 않았습니다. 네트워크를 확인한 뒤 다시 눌러 주세요. (기록은 이 기기에 저장됨)");
    setSending(null);
  };

  if (payload === undefined) return <div className="min-h-screen bg-[#f3f5f9] grid place-items-center text-[16px] text-[#6b7280]">불러오는 중…</div>;
  if (payload === null)
    return (
      <div className="min-h-screen bg-[#f3f5f9] grid place-items-center p-[24px]">
        <div className="max-w-[420px] w-full rounded-[14px] bg-white p-[20px] text-center">
          <div className="text-[18px] font-bold">전파 내용을 찾을 수 없습니다</div>
          <p className="mt-[8px] text-[14px] text-[#6b7280] leading-[1.6]">링크가 잘리거나 만료되었을 수 있습니다. 상황실에 다시 발송을 요청해 주세요.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen">
      <MobileDispatchView payload={payload} state={state} busy={!!sending} sending={sending} noteDraft={note} onNoteChange={setNote} onReceive={() => send("received")} onComplete={() => send("completed")} onNoteSubmit={() => send("note", { note: note.trim() })} />
      {error && <div className="fixed left-[12px] right-[12px] bottom-[12px] rounded-[12px] bg-[#7f1d1d] text-white text-[14px] px-[14px] py-[10px] leading-[1.5]">{error}</div>}
    </div>
  );
}

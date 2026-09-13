"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  현장 요원용 모바일 상황전파 화면 — 실제 페이지(/m/[token])와 발송 미리보기가 공유한다.
//  · 인증 없음 · 필요한 정보만 · 큰 버튼(수신확인 → 임무완료 → 조치사항(옵션))
//  · 갤럭시+크롬 기준 반응형, iOS 사파리에서도 표준 CSS 만 사용
// ─────────────────────────────────────────────────────────────────────────────
import type { DispatchPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface MobileAckState {
  receivedAt?: string;
  completedAt?: string;
  note?: string;
  noteAt?: string;
}

const LEVEL_CLS: Record<string, string> = {
  관심: "bg-[#e0f2fe] text-[#0369a1]",
  주의: "bg-[#fef9c3] text-[#a16207]",
  경계: "bg-[#ffedd5] text-[#c2410c]",
  심각: "bg-[#fee2e2] text-[#b91c1c]",
};

const t = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function MobileDispatchView({
  payload: p,
  state,
  preview,
  busy,
  sending,
  onReceive,
  onComplete,
  onNoteChange,
  onNoteSubmit,
  noteDraft,
}: {
  payload: DispatchPayload;
  state: MobileAckState;
  preview?: boolean;
  busy?: boolean;
  sending?: "received" | "completed" | "note" | null;
  onReceive?: () => void;
  onComplete?: () => void;
  onNoteChange?: (v: string) => void;
  onNoteSubmit?: () => void;
  noteDraft?: string;
}) {
  const received = !!state.receivedAt;
  const completed = !!state.completedAt;
  const noteSaved = !!state.noteAt;
  return (
    <div className={cn("min-h-full bg-[#f3f5f9] text-[#111827] text-[16px] leading-[1.5]", preview && "pointer-events-none select-none")} style={{ fontFamily: "Pretendard, 'Noto Sans KR', -apple-system, system-ui, sans-serif" }}>
      {/* 상단 바 */}
      <div className="bg-[#1f2937] text-white px-[16px] py-[12px] flex items-center gap-[10px]">
        <span className="inline-grid place-items-center size-[32px] rounded-[8px] bg-[#f59e0b] text-[#111827] font-bold text-[14px]">전파</span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] opacity-80 truncate">{p.org} 재난안전대책본부</div>
          <div className="text-[15px] font-semibold truncate">상황전파 · 현장 응답</div>
        </div>
        <span className={cn("shrink-0 rounded-[6px] px-[8px] py-[3px] text-[12px] font-bold", LEVEL_CLS[p.level] ?? "bg-white/20 text-white")}>위기경보 {p.level}</span>
      </div>

      <div className="px-[14px] py-[14px] space-y-[12px] max-w-[560px] mx-auto">
        {/* 상황 */}
        <section className="rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)] px-[16px] py-[14px]">
          <div className="text-[12px] text-[#6b7280] font-medium">상황</div>
          <div className="text-[17px] font-bold mt-[2px] break-keep">{p.sit}</div>
          <div className="text-[13px] text-[#6b7280] mt-[6px]">발송 {t(p.at)} · {p.from}</div>
        </section>

        {/* 전파 내용 */}
        <section className="rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)] px-[16px] py-[14px]">
          {p.node && <div className="inline-block rounded-[6px] bg-[#ede9fe] text-[#6d28d9] text-[12px] font-bold px-[8px] py-[3px] mb-[8px]">조치 · {p.node}</div>}
          <h1 className="text-[20px] font-bold leading-[1.35] break-keep">{p.title}</h1>
          <p className="mt-[10px] text-[16px] whitespace-pre-line break-keep text-[#1f2937]">{p.msg}</p>
        </section>

        {/* 수신자 */}
        <section className="rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)] px-[16px] py-[12px] flex items-center gap-[10px]">
          <span className="inline-grid place-items-center size-[40px] rounded-full bg-[#e5e7eb] text-[#374151] font-bold text-[15px]">{p.to.name.slice(0, 1)}</span>
          <div className="min-w-0">
            <div className="text-[12px] text-[#6b7280]">수신자</div>
            <div className="text-[15px] font-semibold truncate">{p.to.name}{p.to.position ? ` ${p.to.position}` : ""}{p.to.dept ? <span className="font-normal text-[#6b7280]"> · {p.to.dept}</span> : null}</div>
          </div>
        </section>

        {/* 응답 단계 */}
        <section className="rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.06)] px-[16px] py-[14px] space-y-[10px]">
          <div className="text-[13px] text-[#6b7280] font-medium">응답 (누르면 상황실에 즉시 기록됩니다)</div>

          {/* 1. 수신확인 */}
          {received ? (
            <Done step="1" label="수신확인 완료" at={state.receivedAt} />
          ) : (
            <BigButton onClick={onReceive} disabled={busy} loading={sending === "received"} tone="blue">① 수신확인</BigButton>
          )}

          {/* 2. 임무완료 */}
          {completed ? (
            <Done step="2" label="임무완료" at={state.completedAt} />
          ) : (
            <BigButton onClick={onComplete} disabled={busy || !received} loading={sending === "completed"} tone="green">② 임무완료</BigButton>
          )}

          {/* 3. 조치사항 (옵션) */}
          <div className={cn("rounded-[12px] border border-[#e5e7eb] p-[12px]", !received && "opacity-50")}>
            <div className="text-[14px] font-semibold flex items-center justify-between">
              <span>③ 조치사항 <span className="text-[#6b7280] font-normal">(선택)</span></span>
              {noteSaved && <span className="text-[12px] text-[#15803d] font-medium">기록됨 {t(state.noteAt)}</span>}
            </div>
            <textarea
              value={noteDraft ?? state.note ?? ""}
              onChange={(e) => onNoteChange?.(e.target.value)}
              disabled={!received || busy}
              rows={3}
              placeholder="예) 신안리 주민 32명 마을회관 대피 완료, 취약계층 2명 차량 지원"
              className="mt-[8px] w-full rounded-[10px] border border-[#d1d5db] px-[12px] py-[10px] text-[16px] leading-[1.5] outline-none focus:border-[#2563eb] bg-white disabled:bg-[#f9fafb] resize-none"
            />
            <button type="button" onClick={onNoteSubmit} disabled={!received || busy || !(noteDraft ?? "").trim()} className="mt-[8px] w-full h-[44px] rounded-[10px] bg-[#111827] text-white text-[15px] font-semibold disabled:opacity-40 active:opacity-80">
              {sending === "note" ? "전송 중…" : noteSaved ? "조치사항 다시 보내기" : "조치사항 보내기"}
            </button>
          </div>

          {completed && (
            <div className="rounded-[12px] bg-[#ecfdf5] text-[#065f46] px-[12px] py-[10px] text-[14px] leading-[1.5]">
              응답이 상황실에 전달되어 SOP 실행내역과 상황일지에 기록되었습니다. 추가 조치사항이 있으면 위에 입력해 보내 주세요.
            </div>
          )}
        </section>

        <p className="text-[12px] text-[#9ca3af] leading-[1.5] px-[4px]">인증 없이 열리는 상황전파 전용 페이지입니다. 링크를 외부에 공유하지 마세요. 문의: {p.from}</p>
      </div>
    </div>
  );
}

function BigButton({ children, onClick, disabled, loading, tone }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; tone: "blue" | "green" }) {
  const cls = tone === "blue" ? "bg-[#2563eb] active:bg-[#1d4ed8]" : "bg-[#16a34a] active:bg-[#15803d]";
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={cn("w-full h-[56px] rounded-[12px] text-white text-[18px] font-bold shadow-[0_2px_6px_rgba(0,0,0,.12)] disabled:opacity-40 disabled:shadow-none transition-[opacity,background-color]", cls)}>
      {loading ? "전송 중…" : children}
    </button>
  );
}

function Done({ step, label, at }: { step: string; label: string; at?: string }) {
  return (
    <div className="w-full h-[56px] rounded-[12px] bg-[#ecfdf5] border border-[#a7f3d0] text-[#065f46] px-[14px] flex items-center gap-[10px]">
      <span className="inline-grid place-items-center size-[26px] rounded-full bg-[#16a34a] text-white text-[14px] font-bold">✓</span>
      <span className="text-[16px] font-bold">{step}. {label}</span>
      <span className="ml-auto text-[14px] font-medium">{t(at)}</span>
    </div>
  );
}

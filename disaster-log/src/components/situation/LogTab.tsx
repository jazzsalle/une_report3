"use client";

import { useMemo, useRef, useState } from "react";
import { SegmentedControl, Badge as DsBadge, FilterChip } from "@une-front/react-ui";
import type { EventType, Situation, VerifyState } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Card, Dots, SelectBox, TextArea, VerifyBadge, useToast } from "@/components/ui";
import { MarkdownView } from "@/components/ui/MarkdownView";
import { IconAi, IconCheckCircle, IconDownload, IconPrint, IconFilter, IconStop, IconArrowRight, IconMemo, IconClock } from "@/components/icons";
import { LOG_TEMPLATES } from "@/lib/seed/templates";
import { buildContext } from "@/lib/uni/prompts";
import { streamDraft, type StreamMeta } from "@/lib/ai/stream";
import { exportDocx } from "@/lib/export/docx";
import { exportHwpx } from "@/lib/export/hwpx";
import { logExportDoc } from "@/lib/export/build";
import { cn, fmtDate, fmtDateTime, fmtTime } from "@/lib/utils";
import { DISASTER_LABEL } from "@/lib/seed/regions";

const TYPE_LABEL: Record<EventType, string> = { situation: "상황", weather: "기상", document: "문서", sop: "SOP", run: "실행", result: "조치결과", memo: "현장메모", sms: "SMS", resource: "자원", injection: "상황부여", mission: "임무", branch: "상황판단", log: "일지", report: "보고", user: "입력" };
const TYPE_TONE: Record<EventType, "gray" | "blue" | "green" | "amber" | "red" | "purple" | "navy"> = { situation: "navy", weather: "blue", document: "gray", sop: "blue", run: "blue", result: "green", memo: "gray", sms: "purple", resource: "amber", injection: "green", mission: "green", branch: "amber", log: "gray", report: "gray", user: "gray" };

type ViewMode = "edit" | "split" | "preview";

export function LogTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const [filters, setFilters] = useState<Set<EventType>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [draft, setDraft] = useState(s.log.final ?? s.log.draft);
  const [view, setView] = useState<ViewMode>(s.log.draft ? "split" : "edit");
  const [exporting, setExporting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const events = useMemo(() => [...s.ledger].sort((a, b) => a.at.localeCompare(b.at)).filter((e) => filters.size === 0 || filters.has(e.type)), [s.ledger, filters]);
  const types = useMemo(() => Array.from(new Set(s.ledger.map((e) => e.type))), [s.ledger]);
  const days = useMemo(() => Array.from(new Set(events.map((e) => e.at.slice(0, 10)))), [events]);

  const toggleFilter = (t: EventType) => setFilters((f) => { const n = new Set(f); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const cycleVerify = (id: string, v: VerifyState) => st.setLedgerVerify(s.id, id, v === "confirmed" ? "unverified" : v === "unverified" ? "excluded" : "confirmed");

  const persist = (text: string, note?: string) => st.updateLog(s.id, s.log.final ? { final: text } : { draft: text }, note);

  const generate = async () => {
    setGenerating(true);
    setDraft("");
    setMeta(null);
    setStatus("generating");
    setView("split");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    try {
      await streamDraft("log", buildContext(s, { templateName: LOG_TEMPLATES.find((t) => t.id === s.log.templateId)?.name }), { onMeta: setMeta, onStatus: setStatus, onText: (t) => { acc += t; setDraft(acc); }, onError: (e) => toast.error(e) }, ctrl.signal);
      st.updateLog(s.id, { draft: acc, generatedAt: new Date().toISOString() }, "AI 상황일지 초안 생성");
      toast.success("상황일지 초안을 생성했습니다");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setGenerating(false);
      setStatus(null);
    }
  };

  const confirmLog = () => {
    st.updateLog(s.id, { final: draft, confirmedAt: new Date().toISOString(), confirmedBy: st.user.name }, "상황일지 확정");
    toast.success("상황일지를 확정했습니다");
  };

  const doExport = async (kind: "hwpx" | "docx") => {
    setExporting(kind);
    try {
      const doc = logExportDoc(s, draft);
      if (kind === "hwpx") await exportHwpx(doc);
      else await exportDocx(doc);
      toast.success(kind === "hwpx" ? "한글(HWPX) 파일로 내보냈습니다 — 행정문서 템플릿 적용" : "DOCX 파일로 내보냈습니다");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-[1fr_1.15fr] gap-[20rem]">
      {/* 이벤트 원장 */}
      <Card padded={false} className="no-print flex flex-col" title="상황 이벤트 원장" subtitle="S12 · SOP 실행이력·조치결과·SMS·자원·기상·현장입력이 시간순 자동 누적. 확인상태 클릭으로 확인→확인필요→제외 전환." right={<DsBadge label={`${s.ledger.length}건`} color="grayscale" variant="solid-pastel" size="sm" />}>
        <div className="px-[20rem] pb-[12rem] flex items-center gap-[6rem] flex-wrap">
          <IconFilter size={16} className="text-[var(--color-icon-tertiary)]" />
          {types.map((t) => (
            <FilterChip key={t} size="sm" variant="outline" label={`${TYPE_LABEL[t]} ${s.ledger.filter((e) => e.type === t).length}`} selected={filters.has(t)} onClick={() => toggleFilter(t)} />
          ))}
          {filters.size > 0 && <Button size="xs" variant="ghost" onClick={() => setFilters(new Set())}>초기화</Button>}
        </div>
        <div className="border-t border-[var(--color-border-subtle)] overflow-y-auto max-h-[760px]">
          {days.map((day) => (
            <div key={day}>
              <div className="sticky top-0 bg-[var(--color-surface-subtle)] px-[20rem] py-[6rem] typo-body-sm font-medium text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">{fmtDate(day)}</div>
              {events.filter((e) => e.at.startsWith(day)).map((e) => (
                <div key={e.id} className={cn("flex gap-[12rem] px-[20rem] py-[10rem] border-b border-[var(--color-border-subtle)]", e.verify === "excluded" && "opacity-50")}>
                  <div className="font-mono typo-body-sm text-[var(--color-text-helper)] w-[44rem] shrink-0 pt-[2rem]">{fmtTime(e.at)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[8rem] flex-wrap">
                      <Badge tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Badge>
                      <span className="typo-body-md font-medium text-[var(--color-text-primary)] leading-snug">{e.title}</span>
                      <span className="typo-body-sm text-[var(--color-text-helper)] ml-auto">{e.source === "ai" ? "AI" : e.source === "official" ? "공식" : e.source === "sop" ? "SOP" : e.source === "sms" ? "SMS" : e.source === "resource" ? "자원" : "사용자"}{e.actor ? ` · ${e.actor}` : ""}</span>
                    </div>
                    {e.body && <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem] leading-relaxed">{e.body}</div>}
                  </div>
                  <button className="shrink-0 self-start" title="확인상태 전환" onClick={() => cycleVerify(e.id, e.verify)}><VerifyBadge v={e.verify} /></button>
                </div>
              ))}
            </div>
          ))}
          {events.length === 0 && <div className="p-[32rem] text-center typo-body-md text-[var(--color-text-tertiary)]">이벤트가 없습니다</div>}
        </div>
      </Card>

      {/* 상황일지 */}
      <div className="space-y-[16rem]">
        <Card
          title={<span className="inline-flex items-center gap-[8rem]"><IconMemo size={16} /> 상황일지 {s.log.confirmedAt ? <DsBadge label={`확정 ${fmtDateTime(s.log.confirmedAt)}`} color="success" variant="solid-pastel" size="xs" /> : <DsBadge label="미확정" color="light-warning" variant="solid-pastel" size="xs" />}</span>}
          subtitle="UFR-007-003~005 · Markdown 으로 작성·편집합니다. 확인된 이벤트만 사실로 반영, 미확인 항목은 '(확인 필요)'로 표시."
          right={
            <div className="flex gap-[8rem] no-print">
              {generating ? (
                <Button size="sm" variant="outline" leftIcon={<IconStop size={16} />} onClick={() => abortRef.current?.abort()}>중지</Button>
              ) : (
                <Button size="sm" leftIcon={<IconAi size={16} />} onClick={generate}>AI 초안 생성</Button>
              )}
            </div>
          }
        >
          <div className="no-print flex flex-wrap gap-[12rem] items-end mb-[12rem]">
            <div className="flex-1 min-w-[260rem]">
              <SelectBox label="템플릿 (UFR-007-005)" size="sm" value={s.log.templateId} onChange={(v) => st.updateLog(s.id, { templateId: v })} options={LOG_TEMPLATES.filter((t) => t.mode === s.mode).map((t) => ({ value: t.id, label: t.name, helperText: t.description }))} />
            </div>
            <SegmentedControl value={view} setValue={setView} options={[{ value: "edit", label: "편집" }, { value: "split", label: "분할" }, { value: "preview", label: "미리보기" }]} size="sm" fitContent />
          </div>
          <div className="no-print flex items-center gap-[8rem] typo-body-sm text-[var(--color-text-tertiary)] min-h-[20rem] mb-[8rem]">
            {meta && <DsBadge label={meta.source === "uni" ? `UNI RAG · ${meta.model}` : "로컬 대체 생성"} color={meta.source === "uni" ? "success" : "light-warning"} variant="solid-pastel" size="xs" />}
            {status && generating && <span>{status === "generating" ? "생성 중" : status}<Dots /></span>}
            {s.log.generatedAt && !generating && <span className="inline-flex items-center gap-[4rem]"><IconClock size={12} /> 초안 {fmtDateTime(s.log.generatedAt)}</span>}
          </div>

          {/* 편집 / 미리보기 */}
          <div className={cn("print-area grid gap-[12rem]", view === "split" ? "lg:grid-cols-2" : "grid-cols-1")}>
            {view !== "preview" && (
              <div className="no-print">
                <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft !== (s.log.final ?? s.log.draft)) persist(draft, "상황일지 수정"); }} minHeight={520} maxHeight={0} resize="vertical" className="font-mono" placeholder={"AI 초안을 생성하거나 Markdown 으로 직접 작성하세요.\n\n### 2026.09.13\n- **18:40** [기상] 호우경보 발효 (부산 전역)\n- **18:52** [조치] 기상특보 접수 및 전파 — 구·군 상황실 UMS 전파 완료\n\n## 현재까지 종합\n- …"} />
              </div>
            )}
            {view !== "edit" && (
              <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] p-[20rem] min-h-[520px] overflow-y-auto">
                <div className="print-only mb-[16rem]">
                  <h1 className="text-[22px] font-bold text-center">{s.organization} {s.mode === "actual" ? "재난" : "훈련"} 상황일지</h1>
                  <div className="text-center text-[13px] mt-[4rem]">{s.title}</div>
                  <table className="w-full text-[12px] mt-[16rem] border-collapse">
                    <tbody>
                      {[["재난유형", DISASTER_LABEL[s.disasterType]], ["위기경보", s.alertLevel], ["기준시각", fmtDateTime(s.baseTime)], ["작성", s.createdBy]].map(([k, v]) => (
                        <tr key={k}><td className="border px-[8rem] py-[4rem] w-[110px] font-bold bg-[#f4f5f7]">{k}</td><td className="border px-[8rem] py-[4rem]">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {draft.trim() ? <MarkdownView source={draft} /> : <div className="typo-body-md text-[var(--color-text-tertiary)]">미리보기할 내용이 없습니다</div>}
              </div>
            )}
          </div>

          <div className="no-print flex flex-wrap gap-[8rem] mt-[12rem] items-center">
            <Button variant="success" disabled={!draft.trim()} leftIcon={<IconCheckCircle size={16} />} onClick={confirmLog}>최종 상황일지 확정</Button>
            <Button variant="outline" disabled={!draft.trim()} loading={exporting === "hwpx"} leftIcon={<IconDownload size={16} />} onClick={() => doExport("hwpx")}>한글(HWPX)</Button>
            <Button variant="outline" disabled={!draft.trim()} loading={exporting === "docx"} leftIcon={<IconDownload size={16} />} onClick={() => doExport("docx")}>DOCX</Button>
            <Button variant="outline" disabled={!draft.trim()} leftIcon={<IconPrint size={16} />} onClick={() => { setView("preview"); setTimeout(() => window.print(), 150); }}>PDF(인쇄)</Button>
            <span className="typo-body-sm text-[var(--color-text-helper)]">HWPX는 「AI 행정문서 템플릿」 양식(□ ○ - 개조식)으로 변환됩니다</span>
            <Button className="ml-auto" variant="secondary" rightIcon={<IconArrowRight size={16} />} onClick={onNext}>결과보고로</Button>
          </div>
        </Card>

        {s.log.history.length > 0 && (
          <Card title="수정이력" className="no-print">
            <div className="space-y-[4rem] typo-body-sm">
              {[...s.log.history].reverse().map((h, i) => (
                <div key={i} className="flex gap-[12rem]"><span className="font-mono text-[var(--color-text-tertiary)]">{fmtDateTime(h.at)}</span><span className="text-[var(--color-text-basic)]">{h.note}</span><span className="text-[var(--color-text-tertiary)] ml-auto">{h.by}</span></div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

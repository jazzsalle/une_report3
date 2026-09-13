"use client";

import { useEffect, useRef, useState } from "react";
import { SegmentedControl, Badge as DsBadge, IconButton, Checkbox as DsCheckbox } from "@une-front/react-ui";
import type { ReportSection, Situation } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Button, Card, Dots, SelectBox, TextArea, TextInput, useToast } from "@/components/ui";
import { MarkdownView } from "@/components/ui/MarkdownView";
import { IconAi, IconDownload, IconPrint, IconPlus, IconTrash, IconArrowUp, IconArrowDown, IconStop, IconCheckCircle, IconExport } from "@/components/icons";
import { INCLUDE_ITEMS, REPORT_TOC } from "@/lib/seed/templates";
import { buildContext } from "@/lib/uni/prompts";
import { streamDraft, type StreamMeta } from "@/lib/ai/stream";
import { exportDocx } from "@/lib/export/docx";
import { exportHwpx } from "@/lib/export/hwpx";
import { reportExportDoc, reportMarkdown } from "@/lib/export/build";
import { cn, fmtDateTime, uid } from "@/lib/utils";
import { DISASTER_LABEL } from "@/lib/seed/regions";

type ViewMode = "edit" | "preview";

export function ReportTab({ s }: { s: Situation }) {
  const toast = useToast();
  const st = useAppStore();
  const r = s.report;
  const [generating, setGenerating] = useState(false);
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [live, setLive] = useState("");
  const [mode, setMode] = useState<ViewMode>(r.sections.some((x) => x.body) ? "preview" : "edit");
  const [newSec, setNewSec] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generateRef = useRef<() => void>(() => {});

  const setSections = (sections: ReportSection[]) => st.updateReport(s.id, { sections });
  const applyToc = (tocId: string) => {
    const toc = REPORT_TOC.find((t) => t.id === tocId);
    if (!toc) return;
    st.updateReport(s.id, { title: toc.name, type: toc.mode, sections: toc.sections.map((t) => ({ id: uid("sec-"), title: t, body: r.sections.find((x) => x.title === t)?.body ?? "", enabled: true })) }, `목차 템플릿 적용: ${toc.name}`);
  };
  const move = (i: number, d: -1 | 1) => { const a = [...r.sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setSections(a); };

  const includes = Object.entries(r.includes).filter(([, v]) => v).map(([k]) => k);
  const enabledSections = r.sections.filter((x) => x.enabled);

  const generate = async () => {
    if (enabledSections.length === 0) return toast.error("목차를 1개 이상 선택하세요");
    setGenerating(true);
    setLive("");
    setMeta(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let acc = "";
    try {
      await streamDraft("report", buildContext(s, { includes, sections: enabledSections.map((x) => x.title), templateName: r.title }), { onMeta: setMeta, onText: (t) => { acc += t; setLive(acc); }, onError: (e) => toast.error(e) }, ctrl.signal);
      // "## 섹션" 단위로 파싱 → 섹션 본문(Markdown) 배치
      const parts = acc.split(/^##\s+/m).filter((p) => p.trim());
      const parsed = parts.map((p) => { const [h, ...rest] = p.split("\n"); return { title: h.trim(), body: rest.join("\n").trim() }; });
      const norm = (x: string) => x.replace(/^\d+[.)]\s*/, "").replace(/\s|\(|\)|·/g, "");
      const sections = r.sections.map((sec) => {
        if (!sec.enabled) return sec;
        const hit = parsed.find((p) => norm(p.title) === norm(sec.title)) ?? parsed.find((p) => norm(p.title).includes(norm(sec.title).slice(0, 4)) || norm(sec.title).includes(norm(p.title).slice(0, 4)));
        return hit ? { ...sec, body: hit.body } : sec;
      });
      const unmatched = parsed.filter((p) => !sections.some((sec) => sec.body === p.body));
      let ui = 0;
      const finalSections = sections.map((sec) => (sec.enabled && !sec.body && unmatched[ui] ? { ...sec, body: unmatched[ui++].body } : sec));
      st.updateReport(s.id, { sections: finalSections, generatedAt: new Date().toISOString() }, "AI 결과보고 초안 생성");
      setMode("preview");
      toast.success("결과보고 초안을 생성했습니다");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setGenerating(false);
      setLive("");
    }
  };
  // 시연모드: 패널에서 「AI 본문 초안 생성」을 원격 트리거
  useEffect(() => {
    generateRef.current = () => { if (!generating) void generate(); };
  });
  useEffect(() => {
    const h = () => generateRef.current();
    window.addEventListener("demo:generate-report", h);
    return () => window.removeEventListener("demo:generate-report", h);
  }, []);

  const doExport = async (kind: "hwpx" | "docx") => {
    setExporting(kind);
    try {
      const doc = reportExportDoc(s);
      if (kind === "hwpx") await exportHwpx(doc);
      else await exportDocx(doc);
      toast.success(kind === "hwpx" ? "한글(HWPX) 파일로 내보냈습니다 — 행정문서 템플릿 적용" : "DOCX 파일로 내보냈습니다");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  const countOf: Record<string, number> = {
    results: Object.values(s.runs).filter((x) => x.result).length,
    log: s.log.draft ? 1 : 0,
    sms: s.sms.length,
    resources: s.resources.length,
    weather: s.weatherAlerts.length,
    damage: s.ledger.filter((e) => /피해|침수|붕괴|정전/.test(e.title)).length,
    photos: Object.values(s.runs).reduce((n, x) => n + (x.attachments?.length ?? 0), 0),
    plan: s.training ? 1 : 0,
    injections: s.injections.length,
    missions: Object.values(s.runs).filter((x) => x.missionAck).length,
  };

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-[380px_1fr] gap-[20rem]">
      {/* 설정 */}
      <div className="space-y-[16rem] no-print">
        <Card title="보고서 유형 · 목차" subtitle="S13 · UFR-008-001/002 — 템플릿 선택 후 목차를 추가·삭제·순서조정">
          <SelectBox label="보고서 유형" size="sm" value={REPORT_TOC.find((t) => t.name === r.title)?.id ?? ""} onChange={applyToc} placeholder={`직접 구성 — ${r.title}`} options={REPORT_TOC.map((t) => ({ value: t.id, label: t.name }))} />
          <div className="mt-[12rem]">
            <TextInput label="보고서 제목" size="sm" value={r.title} onChange={(e) => st.updateReport(s.id, { title: e.target.value })} />
          </div>
          <div className="label mt-[16rem] mb-[6rem]">목차 ({enabledSections.length}/{r.sections.length})</div>
          <div className="space-y-[4rem]">
            {r.sections.map((sec, i) => (
              <div key={sec.id} className={cn("flex items-center gap-[6rem] rounded-lg border p-[6rem]", sec.enabled ? "border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]" : "border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] opacity-70")}>
                <DsCheckbox size="sm" checked={sec.enabled} onCheckedChange={(v) => setSections(r.sections.map((x) => (x.id === sec.id ? { ...x, enabled: v } : x)))} />
                <span className="typo-body-sm text-[var(--color-text-helper)] w-[16rem]">{i + 1}</span>
                <input className="flex-1 typo-body-md font-medium bg-transparent outline-none text-[var(--color-text-primary)] min-w-0" value={sec.title} onChange={(e) => setSections(r.sections.map((x) => (x.id === sec.id ? { ...x, title: e.target.value } : x)))} />
                {sec.body && <DsBadge label="✓" color="success" variant="solid-pastel" size="xs" />}
                <IconButton icon={<IconArrowUp size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={<IconArrowDown size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="아래로" disabled={i === r.sections.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={<IconTrash size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="삭제" onClick={() => setSections(r.sections.filter((x) => x.id !== sec.id))} />
              </div>
            ))}
          </div>
          <div className="flex gap-[6rem] mt-[8rem]">
            <div className="flex-1">
              <TextInput size="xs" placeholder="목차 직접 추가" value={newSec} onChange={(e) => setNewSec(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSec.trim()) { setSections([...r.sections, { id: uid("sec-"), title: newSec.trim(), body: "", enabled: true }]); setNewSec(""); } }} />
            </div>
            <IconButton icon={<IconPlus size={16} />} variant="outline" color="grayscale" size="xs" aria-label="추가" onClick={() => { if (newSec.trim()) { setSections([...r.sections, { id: uid("sec-"), title: newSec.trim(), body: "", enabled: true }]); setNewSec(""); } }} />
          </div>
        </Card>

        <Card title="반영자료 선택" subtitle="UFR-008-003 · 선택하지 않은 자료는 본문 생성에 사용되지 않습니다.">
          <div className="grid grid-cols-2 gap-[6rem]">
            {INCLUDE_ITEMS.filter((it) => it.modes.includes(s.mode)).map((it) => {
              const on = !!r.includes[it.key];
              return (
                <div key={it.key} className={cn("flex items-center gap-[8rem] rounded-lg border p-[8rem] typo-body-sm", on ? "border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)]" : "border-[var(--color-border-subtle)]")}>
                  <DsCheckbox size="sm" checked={on} onCheckedChange={(v) => st.updateReport(s.id, { includes: { ...r.includes, [it.key]: v } })} label={it.label} />
                  <span className="ml-auto text-[var(--color-text-helper)]">{countOf[it.key] ?? 0}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-[12rem] typo-body-sm text-[var(--color-text-tertiary)] leading-relaxed">{s.mode === "actual" ? "실제재난 보고서는 SOP 상세의 조치결과를 우선 원천으로 사용합니다 (현장메모와 구분)." : "훈련 보고서는 상황부여·임무 수신/확인/완료 이력을 주요 원천으로 사용합니다."}</div>
        </Card>

        {generating ? (
          <Button className="w-full" size="lg" variant="outline" leftIcon={<IconStop size={16} />} onClick={() => abortRef.current?.abort()}>생성 중지</Button>
        ) : (
          <Button className="w-full" size="lg" leftIcon={<IconAi size={16} />} onClick={generate}>AI 본문 초안 생성 (UNI 챗)</Button>
        )}
        {meta && <div className="text-center"><DsBadge label={meta.source === "uni" ? `UNI RAG · ${meta.model}` : "로컬 대체 생성"} color={meta.source === "uni" ? "success" : "light-warning"} variant="solid-pastel" size="sm" /></div>}
      </div>

      {/* 본문 */}
      <Card
        padded={false}
        title={<span className="inline-flex items-center gap-[8rem]"><IconExport size={16} /> {r.title}</span>}
        subtitle={r.generatedAt ? `초안 생성 ${fmtDateTime(r.generatedAt)} · Markdown 편집 가능` : "초안 미생성 · Markdown 으로 직접 작성할 수 있습니다"}
        right={
          <div className="flex gap-[6rem] no-print flex-wrap justify-end">
            <SegmentedControl value={mode} setValue={setMode} options={[{ value: "edit", label: "편집" }, { value: "preview", label: "미리보기" }]} size="sm" fitContent />
            <Button size="sm" variant="outline" loading={exporting === "hwpx"} leftIcon={<IconDownload size={16} />} onClick={() => doExport("hwpx")}>한글(HWPX)</Button>
            <Button size="sm" variant="outline" loading={exporting === "docx"} leftIcon={<IconDownload size={16} />} onClick={() => doExport("docx")}>DOCX</Button>
            <Button size="sm" variant="outline" leftIcon={<IconPrint size={16} />} onClick={() => { setMode("preview"); setTimeout(() => window.print(), 150); }}>PDF</Button>
            <Button size="sm" variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => { st.updateReport(s.id, {}, "결과보고 확정"); toast.success("결과보고를 확정했습니다"); }}>확정</Button>
          </div>
        }
      >
        <div className="print-area px-[20rem] pb-[24rem]">
          {generating && (
            <div className="mb-[16rem] rounded-xl border border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)] p-[16rem]">
              <div className="typo-body-sm font-medium text-[var(--color-text-brand)] flex items-center gap-[6rem]"><IconAi size={16} className="pulse-soft" /> 본문 생성 중<Dots /></div>
              <div className="mt-[8rem] max-h-[300px] overflow-y-auto"><MarkdownView source={live} /></div>
            </div>
          )}

          {/* 문서 헤더 (미리보기·인쇄) */}
          {mode === "preview" && (
            <div className="mb-[16rem]">
              <h1 className="text-[22px] font-bold text-center mt-[8rem] text-[var(--color-text-primary)]">{r.title}</h1>
              <div className="text-center typo-body-md text-[var(--color-text-tertiary)] mt-[4rem]">{s.title}</div>
              <table className="w-full typo-body-sm mt-[16rem] border-collapse">
                <tbody>
                  {[["업무유형", s.mode === "actual" ? "실제재난" : "안전한국훈련"], ["지자체", s.organization], ["재난유형", DISASTER_LABEL[s.disasterType]], ["위기경보", s.alertLevel], ["기준시각", fmtDateTime(s.baseTime)], ["발생·영향지역", s.regions.map((x) => [x.sigungu, x.dong].filter(Boolean).join(" ")).join(", ") || "-"]].map(([k, v]) => (
                    <tr key={k}><td className="border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] px-[8rem] py-[4rem] w-[120px] font-medium">{k}</td><td className="border border-[var(--color-border-default)] px-[8rem] py-[4rem]">{v}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {mode === "edit" ? (
            <div className="space-y-[16rem]">
              {enabledSections.map((sec, i) => (
                <section key={sec.id}>
                  <h2 className="typo-body-lg font-bold pl-[10rem] border-l-4 border-[var(--color-surface-brand)] text-[var(--color-text-primary)] mb-[8rem]">{i + 1}. {sec.title}</h2>
                  <TextArea value={sec.body} onChange={(e) => setSections(r.sections.map((x) => (x.id === sec.id ? { ...x, body: e.target.value } : x)))} minHeight={110} maxHeight={0} resize="vertical" placeholder={"Markdown 으로 작성 — 예)\n- **18:40** 호우경보 발효, 구·군 전파 완료\n  - 하상도로 통제 2개소\n| 항목 | 내용 |\n|---|---|"} className="font-mono" />
                </section>
              ))}
              {enabledSections.length === 0 && <div className="typo-body-md text-[var(--color-text-tertiary)] py-[40rem] text-center">목차를 선택하세요</div>}
            </div>
          ) : (
            <MarkdownView source={reportMarkdown(s)} />
          )}

          {r.history.length > 0 && (
            <div className="no-print mt-[24rem] typo-body-sm text-[var(--color-text-tertiary)]">
              <div className="label mb-[4rem]">수정이력</div>
              {[...r.history].reverse().slice(0, 5).map((h, i) => <div key={i}>{fmtDateTime(h.at)} · {h.note} · {h.by}</div>)}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

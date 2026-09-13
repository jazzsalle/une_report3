"use client";

import { useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { SegmentedControl, Badge as DsBadge, ChoiceChip } from "@une-front/react-ui";
import type { NodeRun, ResourceSource, Situation, SopNode } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Card, EmptyState, Field, Modal, SelectBox, TextArea, TextInput, useToast } from "@/components/ui";
import { IconPlay, IconStop, IconCheckCircle, IconSkip, IconMessage, IconStorage, IconAttach, IconNodeDecision, IconArrowRight, IconDocsCheck, IconAnnounce, IconSend, IconRefresh, IconMemo } from "@/components/icons";
import { SopCanvas } from "@/components/sop/SopCanvas";
import { orderedNodeIds } from "@/lib/sop/converters";
import { cn, fmtDateTime, fmtTime, nowIso } from "@/lib/utils";

const KIND_TONE = { start: "gray", end: "gray", process: "blue", decision: "amber", spread: "purple", resource: "green" } as const;
const KIND_LABEL = { start: "시작", end: "종료", process: "프로세스", decision: "상황판단", spread: "상황전파", resource: "자원" } as const;

export function RunTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
  const [selId, setSelId] = useState<string | null>(s.currentNodeId ?? null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [view, setView] = useState<"list" | "canvas">("list");

  const ordered = useMemo(() => (active ? orderedNodeIds(active.nodes, active.edges) : []), [active]);
  const nodes = useMemo(() => active?.nodes ?? [], [active]);
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const sel = selId ? byId(selId) : byId(s.currentNodeId ?? "") ?? nodes.find((n) => s.runs[n.id]?.status === "running");
  const selRun: NodeRun | undefined = sel ? s.runs[sel.id] : undefined;
  const stats = useMemo(() => {
    const work = nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end");
    return { total: work.length, done: work.filter((n) => s.runs[n.id]?.status === "done").length, running: work.filter((n) => s.runs[n.id]?.status === "running").length };
  }, [nodes, s.runs]);

  if (!active) return <div className="p-[28rem]"><EmptyState icon={<IconPlay size={28} />} title="실행할 SOP가 없습니다" desc="SOP 구성·편집 단계에서 실행본을 확정하세요." /></div>;
  const isConfirmed = active.kind === "confirmed";

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-[1fr_1.15fr] gap-[20rem]">
      {/* 좌: 기준 SOP */}
      <Card
        padded={false}
        className="flex flex-col min-h-[560px]"
        title={<span className="inline-flex items-center gap-[8rem]">기준 SOP (v{active.version}) {s.running ? <DsBadge label="실행 중" color="success" variant="dot-accent" size="xs" /> : <DsBadge label="대기" color="grayscale" variant="dot-neutral" size="xs" />}</span>}
        subtitle={`S09 · ${stats.done}/${stats.total} 완료 · 진행 ${stats.running}`}
        right={
          <div className="flex gap-[8rem] items-center">
            <SegmentedControl value={view} setValue={setView} options={[{ value: "list", label: "목록" }, { value: "canvas", label: "플로우" }]} size="sm" fitContent />
            {!s.running ? (
              <Button size="sm" variant="success" leftIcon={<IconPlay size={16} />} onClick={() => { if (!isConfirmed) return toast.error("실행본으로 확정된 버전만 실행할 수 있습니다"); st.startRun(s.id); toast.success("SOP 실행을 시작했습니다"); }}>
                실행 시작
              </Button>
            ) : (
              <Button size="sm" variant="outline" leftIcon={<IconStop size={16} />} onClick={() => st.stopRun(s.id)}>중지</Button>
            )}
          </div>
        }
      >
        {!isConfirmed && <div className="mx-[20rem] mb-[12rem] rounded-lg bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)] typo-body-sm p-[10rem]">현재 활성 버전이 실행본이 아닙니다. SOP 탭에서 실행본을 확정하세요.</div>}
        {view === "list" ? (
          <div className="flex-1 overflow-y-auto border-t border-[var(--color-border-subtle)] max-h-[720px]">
            {ordered.map((id, idx) => {
              const n = byId(id)!;
              const r = s.runs[id];
              const status = r?.status ?? "pending";
              const isSel = sel?.id === id;
              return (
                <button key={id} onClick={() => setSelId(id)} className={cn("w-full text-left flex items-start gap-[12rem] px-[20rem] py-[12rem] border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)] transition", isSel && "bg-[var(--color-surface-brand-subtle)]")}>
                  <span className={cn("step-dot mt-[2rem]", status === "done" ? "bg-[var(--color-surface-success)] text-white" : status === "running" ? "bg-[var(--color-surface-brand)] text-[var(--color-text-on-brand)]" : status === "skipped" ? "bg-[var(--color-surface-disabled-strong)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-text-tertiary)]")}>{status === "done" ? "✓" : idx}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[8rem]">
                      <Badge tone={KIND_TONE[n.data.kind]}>{KIND_LABEL[n.data.kind]}</Badge>
                      <span className={cn("typo-body-md font-medium truncate text-[var(--color-text-primary)]", status === "skipped" && "line-through text-[var(--color-text-tertiary)]")}>{n.data.title}</span>
                      {s.currentNodeId === id && s.running && <DsBadge label="현재" color="success" variant="solid" size="xs" />}
                    </div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem] flex gap-[8rem] flex-wrap">
                      {n.data.leadDept && <span>{n.data.leadDept}</span>}
                      {r?.startedAt && <span>시작 {fmtTime(r.startedAt)}</span>}
                      {r?.finishedAt && <span>완료 {fmtTime(r.finishedAt)}</span>}
                      {r?.branchValue && <span className="text-[var(--yellow-700)] font-medium">분기 &quot;{r.branchValue}&quot;</span>}
                    </div>
                    {r?.result && <div className="typo-body-sm mt-[4rem] text-[var(--color-text-basic)] line-clamp-2">결과: {r.result}</div>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex-1 min-h-[520px] border-t border-[var(--color-border-subtle)]">
            <ReactFlowProvider>
              <SopCanvas nodes={active.nodes} edges={active.edges} runStatus={s.runs} currentNodeId={s.currentNodeId} readOnly onSelect={(n) => n && setSelId(n)} />
            </ReactFlowProvider>
          </div>
        )}
      </Card>

      {/* 우: 현재 노드 처리 + 타임라인 */}
      <div className="space-y-[20rem]">
        {sel ? <NodeWork s={s} node={sel} run={selRun} onSms={() => setSmsOpen(true)} onRes={() => setResOpen(true)} /> : <Card><EmptyState size="sm" icon={<IconDocsCheck size={28} />} title="노드를 선택하세요" desc="좌측 목록에서 처리할 조치를 선택하면 시작/완료·조치결과·현장메모·전파·자원 입력을 할 수 있습니다." /></Card>}

        <Card title="실제 수행 타임라인" subtitle="기준 SOP ↔ 실제 수행 비교 (UFR-005-002)" right={<Button size="sm" variant="outline" rightIcon={<IconArrowRight size={16} />} onClick={onNext}>상황일지로</Button>}>
          <div className="space-y-[10rem] max-h-[360px] overflow-y-auto pr-[4rem]">
            {[...s.ledger].filter((e) => ["run", "result", "branch", "sms", "resource", "mission", "memo"].includes(e.type)).reverse().slice(0, 40).map((e) => (
              <div key={e.id} className="flex gap-[12rem]">
                <div className="typo-body-sm font-mono text-[var(--color-text-helper)] w-[40rem] shrink-0 pt-[2rem]">{fmtTime(e.at)}</div>
                <div className={cn("w-[4rem] rounded-max shrink-0 my-[2rem]", e.type === "result" ? "bg-[var(--color-surface-success)]" : e.type === "sms" ? "bg-[var(--purple-500)]" : e.type === "resource" ? "bg-[var(--color-surface-light-warning)]" : e.type === "branch" ? "bg-[var(--yellow-400)]" : "bg-[var(--color-surface-brand)]")} />
                <div className="min-w-0">
                  <div className="typo-body-sm font-medium text-[var(--color-text-primary)]">{e.title}</div>
                  {e.body && <div className="typo-body-sm text-[var(--color-text-tertiary)] line-clamp-2">{e.body}</div>}
                </div>
              </div>
            ))}
            {s.ledger.filter((e) => e.type === "run").length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">실행 기록이 없습니다</div>}
          </div>
        </Card>

        <Card title="상황 변화 대응" subtitle="S11 · 상황 확대 또는 복구 필요 시 관련 문서를 다시 조회하고 추가 SOP를 구성합니다. 기존 실행이력은 유지됩니다.">
          <div className="flex gap-[8rem] flex-wrap">
            <a href={`/situations/${s.id}?tab=docs`}><Button variant="outline" size="sm" leftIcon={<IconDocsCheck size={16} />}>관련 문서 재조회 · 추가 SOP</Button></a>
            <Button variant="outline" size="sm" leftIcon={<IconRefresh size={16} />} onClick={() => { const v = prompt("상황 변화 내용을 입력하세요"); if (v) st.addLedger(s.id, { type: "user", title: "상황 변화 기록", body: v, source: "user", verify: "confirmed" }); }}>상황변화 메모</Button>
          </div>
        </Card>
      </div>

      {sel && <SmsModal open={smsOpen} onClose={() => setSmsOpen(false)} s={s} node={sel} />}
      {sel && <ResourceModal open={resOpen} onClose={() => setResOpen(false)} s={s} node={sel} />}
    </div>
  );
}

// ── 노드 처리 카드 ───────────────────────────────────────────────────────────
function NodeWork({ s, node, run, onSms, onRes }: { s: Situation; node: SopNode; run?: NodeRun; onSms: () => void; onRes: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const d = node.data;
  const status = run?.status ?? "pending";
  const [result, setResult] = useState(run?.result ?? "");
  const [memo, setMemo] = useState(run?.fieldMemo ?? "");
  const [assignee, setAssignee] = useState(run?.assignee ?? st.user.name);
  const [branch, setBranch] = useState(run?.branchValue ?? d.branches?.[0] ?? "");
  const [prevId, setPrevId] = useState(node.id);
  if (prevId !== node.id) {
    setPrevId(node.id);
    setResult(run?.result ?? "");
    setMemo(run?.fieldMemo ?? "");
    setAssignee(run?.assignee ?? st.user.name);
    setBranch(run?.branchValue ?? d.branches?.[0] ?? "");
  }
  const terminal = d.kind === "start" || d.kind === "end";
  const saveFields = (extra?: Partial<NodeRun>) => st.updateRun(s.id, node.id, { result: result || undefined, fieldMemo: memo || undefined, assignee, ...extra });
  const nodeSms = s.sms.filter((m) => m.nodeId === node.id);
  const nodeRes = s.resources.filter((r) => r.nodeId === node.id);
  const activeVer = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
  const branchTargets = activeVer?.edges.filter((e) => e.source === node.id && (e.label ?? "") === branch).map((e) => activeVer.nodes.find((n) => n.id === e.target)?.data.title ?? e.target) ?? [];

  return (
    <Card
      title={<span className="inline-flex items-center gap-[8rem]"><Badge tone={KIND_TONE[d.kind]}>{KIND_LABEL[d.kind]}</Badge> {d.title}</span>}
      subtitle={[d.leadDept && `담당 ${d.leadDept}`, d.supportDept && `지원 ${d.supportDept}`, d.coopAgencies && `협업 ${d.coopAgencies}`].filter(Boolean).join(" · ") || undefined}
      right={<DsBadge label={{ pending: "대기", running: "진행 중", done: "완료", skipped: "생략" }[status]} color={status === "done" ? "success" : status === "running" ? "primary" : "grayscale"} variant={status === "running" ? "solid" : "solid-pastel"} size="sm" />}
    >
      {terminal ? (
        <div className="typo-body-md text-[var(--color-text-tertiary)]">{d.kind === "start" ? "실행 시작 시 자동 완료됩니다." : "모든 조치가 완료되면 자동으로 도달합니다."}</div>
      ) : (
        <div className="space-y-[16rem]">
          {d.details && d.details.length > 0 && (
            <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
              <div className="label mb-[4rem]">세부행동 (매뉴얼 자동입력)</div>
              <ul className="list-disc pl-[16rem] typo-body-sm space-y-[2rem] leading-relaxed text-[var(--color-text-basic)]">{d.details.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}</ul>
              {(d.targets?.length || d.resources?.length) ? (
                <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[8rem] flex gap-[12rem] flex-wrap">
                  {d.targets?.length ? <span>전파대상: {d.targets.join(", ")}</span> : null}
                  {d.resources?.length ? <span>필요자원: {d.resources.join(", ")}</span> : null}
                </div>
              ) : null}
            </div>
          )}

          {d.kind === "decision" ? (
            <div className="rounded-xl border border-[var(--yellow-75)] bg-[var(--yellow-20)] p-[16rem]">
              <div className="typo-body-md font-medium text-[var(--yellow-700)] flex items-center gap-[6rem]"><IconNodeDecision size={16} /> 분기값 선택 (UFR-005-010)</div>
              {d.details?.length ? <div className="typo-body-sm text-[var(--color-text-basic)] mt-[4rem]">{d.details.join(" / ")}</div> : null}
              <div className="flex flex-wrap gap-[6rem] mt-[12rem]">
                {(d.branches ?? []).map((b) => (
                  <ChoiceChip key={b} label={b} size="md" variant="outline" selected={branch === b} disabled={status === "done"} onClick={() => setBranch(b)} />
                ))}
              </div>
              <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[8rem]">→ 연결대상: {branchTargets.join(", ") || "(미지정 → 첫 연결로 진행)"}</div>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-[12rem]">
                <TextInput label="실제 담당자 (UFR-005-006)" value={assignee} onChange={(e) => setAssignee(e.target.value)} onBlur={() => saveFields()} />
                <TextInput label="시각" readOnly value={`${run?.startedAt ? `시작 ${fmtDateTime(run.startedAt)}` : "미시작"}${run?.finishedAt ? ` · 완료 ${fmtDateTime(run.finishedAt)}` : ""}`} />
              </div>
              <TextArea label="현장메모 (UFR-005-004)" minHeight={60} value={memo} onChange={(e) => setMemo(e.target.value)} helperText="진행 중 참고사항 — 보고서 핵심결과와 구분되어 저장됩니다." onBlur={() => { if (memo !== (run?.fieldMemo ?? "")) st.updateRun(s.id, node.id, { fieldMemo: memo }, memo ? { title: `현장메모: ${d.title}`, body: memo, type: "memo" } : undefined); }} />
              <TextArea label="조치결과 (UFR-005-005) *" minHeight={84} value={result} onChange={(e) => setResult(e.target.value)} onBlur={() => saveFields()} placeholder="예) 구·군 상황실 및 재난공무원 UMS 전파 완료(수신 1,240명)" helperText="상황일지·결과보고의 핵심 원천자료. 완료 시 함께 기록됩니다." intent={result ? "complete" : "default"} />
              <div className="flex flex-wrap gap-[8rem] items-center">
                <Button size="sm" variant="outline" leftIcon={<IconMessage size={16} />} onClick={onSms}>SMS 발송{nodeSms.length ? ` (${nodeSms.length})` : ""}</Button>
                <Button size="sm" variant="outline" leftIcon={<IconStorage size={16} />} onClick={onRes}>자원 투입{nodeRes.length ? ` (${nodeRes.length})` : ""}</Button>
                <label className="inline-flex items-center gap-[6rem] typo-body-md font-medium cursor-pointer rounded-sm border border-[var(--color-interaction-secondary-border-default)] px-[12rem] h-[32rem] hover:bg-[var(--color-interaction-secondary-bg-subtle-hover)] text-[var(--color-text-basic)]">
                  <IconAttach size={16} /> 증빙 첨부
                  <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { st.updateRun(s.id, node.id, { attachments: [...(run?.attachments ?? []), { name: f.name, size: f.size }] }, { title: `증빙 첨부: ${f.name}`, type: "run" }); toast.success("첨부 기록"); } }} />
                </label>
                {run?.attachments?.length ? <span className="typo-body-sm text-[var(--color-text-tertiary)]">{run.attachments.map((a) => a.name).join(", ")}</span> : null}
              </div>
              {s.mode === "training" && (
                <div className="rounded-xl border border-[var(--green-75)] bg-[var(--color-surface-success-subtle)] p-[12rem]">
                  <div className="typo-body-sm font-medium text-[var(--color-text-success)] flex items-center gap-[6rem]"><IconSend size={16} /> 훈련 임무 수신·확인·완료 (UFR-005-009)</div>
                  <div className="flex gap-[8rem] mt-[8rem] flex-wrap">
                    {(["received", "confirmed", "completed"] as const).map((k, i) => {
                      const v = run?.missionAck?.[k];
                      const label = ["임무 수신", "담당자 확인", "임무 완료"][i];
                      return (
                        <Button key={k} size="sm" variant={v ? "success" : "outline"} leftIcon={v ? <IconCheckCircle size={16} /> : undefined} onClick={() => { if (v) return; st.updateRun(s.id, node.id, { missionAck: { ...(run?.missionAck ?? {}), [k]: nowIso(), by: assignee } }, { title: `${label}: ${d.title}`, body: `${assignee}`, type: "mission" }); }}>
                          {label}{v ? ` ${fmtTime(v)}` : ""}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex gap-[8rem] pt-[12rem] border-t border-[var(--color-border-subtle)] flex-wrap">
            {status === "pending" && <Button variant="secondary" leftIcon={<IconPlay size={16} />} onClick={() => { st.startNode(s.id, node.id); saveFields(); }}>시작</Button>}
            {status !== "done" && status !== "skipped" && (
              <Button variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => {
                if (d.kind !== "decision" && !result.trim() && !confirm("조치결과가 비어 있습니다. 결과 없이 완료할까요?")) return;
                if (d.kind === "decision" && !branch) return toast.error("분기값을 선택하세요");
                saveFields();
                st.completeNode(s.id, node.id, result || undefined, d.kind === "decision" ? branch : undefined);
                toast.success(d.kind === "decision" ? `분기 "${branch}" 로 진행` : "조치를 완료했습니다");
              }}>{d.kind === "decision" ? "분기 확정·다음으로" : "완료"}</Button>
            )}
            {status !== "done" && status !== "skipped" && <Button variant="ghost" leftIcon={<IconSkip size={16} />} onClick={() => st.skipNode(s.id, node.id)}>생략</Button>}
            {status === "done" && <Button variant="outline" leftIcon={<IconMemo size={16} />} onClick={() => { saveFields(); toast.success("조치결과를 수정했습니다"); st.addLedger(s.id, { type: "result", title: `조치결과 수정: ${d.title}`, body: result, source: "user", verify: "confirmed", refId: node.id }); }}>결과 수정 저장</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── SMS 모달 ─────────────────────────────────────────────────────────────────
function SmsModal({ open, onClose, s, node }: { open: boolean; onClose: () => void; s: Situation; node: SopNode }) {
  const toast = useToast();
  const st = useAppStore();
  const spread = node.data.subMissions.find((m) => m.type === "spread");
  const [recipients, setRecipients] = useState((node.data.targets ?? []).join(", "));
  const [message, setMessage] = useState(spread?.spreadContent ?? `[${s.organization} 재대본] ${node.data.title} 관련 안내입니다.`);
  return (
    <Modal open={open} onClose={onClose} title="상황전파 SMS 발송" description="UFR-006-001/002 · T3Q 전파대상은 추천정보이며 실제 수신자는 사용자가 확정합니다. 발송이력은 SOP 조치와 연결되어 상황일지·결과보고에 반영됩니다." size="md" footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button leftIcon={<IconSend size={16} />} onClick={() => { const rs = recipients.split(",").map((x) => x.trim()).filter(Boolean); if (!rs.length || !message.trim()) return toast.error("수신대상과 문안을 입력하세요"); st.addSms(s.id, { nodeId: node.id, recipients: rs, message }); toast.success("SMS를 발송했습니다 (UNE SMS 모듈 모의)"); onClose(); }}>발송</Button></>}>
      <div className="space-y-[12rem]">
        <TextInput label="수신대상 (쉼표 구분)" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="시장, 부시장, 구·군 재난담당관, 유관기관 상황실" />
        <TextArea label="발송 문안" minHeight={110} value={message} onChange={(e) => setMessage(e.target.value)} showCounter maxLength={2000} />
        {s.sms.filter((m) => m.nodeId === node.id).length > 0 && (
          <div>
            <div className="label mb-[4rem]">이 조치의 발송이력</div>
            {s.sms.filter((m) => m.nodeId === node.id).map((m) => (
              <div key={m.id} className="typo-body-sm flex gap-[8rem] items-center py-[4rem] border-t border-[var(--color-border-subtle)]"><span className="font-mono text-[var(--color-text-tertiary)]">{fmtTime(m.at)}</span><span className="flex-1 truncate text-[var(--color-text-basic)]">{m.recipients.join(", ")}</span><DsBadge label={m.result === "success" ? "성공" : "실패"} color={m.result === "success" ? "success" : "error"} variant="solid-pastel" size="xs" /></div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── 자원 모달 ─────────────────────────────────────────────────────────────────
function ResourceModal({ open, onClose, s, node }: { open: boolean; onClose: () => void; s: Situation; node: SopNode }) {
  const toast = useToast();
  const st = useAppStore();
  const [name, setName] = useState(node.data.resources?.[0] ?? "");
  const [category, setCategory] = useState<"인력" | "장비" | "자재">("장비");
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState("대");
  const [source, setSource] = useState<ResourceSource>("internal");
  const INTERNAL = ["양수기", "배수펌프", "비상발전기", "모래주머니", "덤프트럭", "굴삭기", "살수차", "비상급수차", "제설차", "염화칼슘", "구호물품세트", "예찰 인력", "응급복구 인력"];
  return (
    <Modal open={open} onClose={onClose} title="재난자원 투입 등록" description="UFR-006-004~006 · 수기/내부/KRMS 출처를 구분해 동일 자원 객체로 관리합니다." size="md" footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button leftIcon={<IconStorage size={16} />} onClick={() => { if (!name.trim()) return toast.error("자원명을 입력하세요"); st.addResource(s.id, { nodeId: node.id, name: name.trim(), category, qty, unit, source }); toast.success("자원 투입을 등록했습니다"); onClose(); }}>등록</Button></>}>
      <div className="space-y-[12rem]">
        <SegmentedControl value={source} setValue={(v) => { const nv = typeof v === "function" ? v(source) : v; if (nv !== "KRMS") setSource(nv); }} options={[{ value: "manual", label: "수기 입력" }, { value: "internal", label: "내부 자원목록" }, { value: "KRMS", label: "KRMS (연계 예정)", disabled: true }]} fullWidth />
        {source === "internal" && (
          <div className="flex flex-wrap gap-[6rem]">
            {INTERNAL.map((x) => <ChoiceChip key={x} label={x} size="sm" variant="outline" selected={name === x} onClick={() => { setName(x); setCategory(/인력/.test(x) ? "인력" : /주머니|염화|물품/.test(x) ? "자재" : "장비"); setUnit(/인력/.test(x) ? "명" : /주머니|물품/.test(x) ? "개" : /염화/.test(x) ? "톤" : "대"); }} />)}
          </div>
        )}
        <div className="grid grid-cols-2 gap-[12rem]">
          <TextInput label="자원명" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectBox label="분류" value={category} onChange={(v) => setCategory(v as never)} options={[{ value: "인력", label: "인력" }, { value: "장비", label: "장비" }, { value: "자재", label: "자재" }]} />
          <TextInput label="수량" type="number" value={String(qty)} min={1} onChange={(e) => setQty(Number(e.target.value))} />
          <TextInput label="단위" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-[12rem] typo-body-sm text-[var(--color-text-tertiary)]">KRMS 연계 자리: 지역·자원분류·가용상태 조회 → 선택 (UFR-006-005). 이번 범위는 인터페이스 추상화만 제공합니다.</div>
        {s.resources.filter((r) => r.nodeId === node.id).length > 0 && (
          <div>
            <div className="label mb-[4rem]">이 조치의 투입자원</div>
            {s.resources.filter((r) => r.nodeId === node.id).map((r) => (
              <div key={r.id} className="typo-body-sm flex items-center gap-[8rem] py-[4rem] border-t border-[var(--color-border-subtle)] text-[var(--color-text-basic)]"><span className="flex-1">{r.name} {r.qty}{r.unit} · {r.category} · {r.source}</span>{r.returnedAt ? <DsBadge label={`회수 ${fmtTime(r.returnedAt)}`} color="grayscale" variant="solid-pastel" size="xs" /> : <Button size="xs" variant="outline" onClick={() => st.returnResource(s.id, r.id)}>회수</Button>}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export { Field, IconAnnounce };

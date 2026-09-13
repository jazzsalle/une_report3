"use client";

import { useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { SegmentedControl, Badge as DsBadge, ChoiceChip, Checkbox as DsCheckbox } from "@une-front/react-ui";
import type { Contact, NodeRun, ResourceSource, Situation, SopNode } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Card, EmptyState, Field, Help, Modal, SelectBox, TextArea, TextInput, useToast } from "@/components/ui";
import { IconPlay, IconStop, IconCheckCircle, IconSkip, IconMessage, IconStorage, IconAttach, IconNodeDecision, IconArrowRight, IconDocsCheck, IconAnnounce, IconSend, IconRefresh, IconMemo, IconClick, IconPerson, IconClock } from "@/components/icons";
import { SopCanvas } from "@/components/sop/SopCanvas";
import { LibraryPicker } from "@/components/sop/LibraryPicker";
import { orderedNodeIds } from "@/lib/sop/converters";
import { cn, fmtDateTime, fmtTime, nowIso } from "@/lib/utils";
import Link from "next/link";

const KIND_TONE = { start: "gray", end: "gray", process: "blue", decision: "amber", spread: "purple", resource: "green" } as const;
const KIND_LABEL = { start: "시작", end: "종료", process: "프로세스", decision: "상황판단", spread: "상황전파", resource: "자원" } as const;

const HELP = {
  baseSop: "이 상황에서 실행하기로 확정한 SOP(실행본)입니다. 위에서 아래로 순서대로 조치를 진행하며, 각 조치를 선택하면 우측에서 세부행동 체크·조치결과·전파·자원 입력을 할 수 있습니다.\n\n「목록」은 순서대로 보기, 「플로우」는 흐름도로 보기입니다. 어느 쪽에서든 조치를 클릭하면 우측에 처리 화면이 열립니다.",
  timeline: "실제로 수행한 순서와 시각을 기준 SOP 와 나란히 비교할 수 있게 쌓아 둔 기록입니다. 조치 시작·완료, 세부행동 체크, 조치결과, SMS 발송, 자원 투입, 상황판단 분기가 자동으로 남고 그대로 상황일지의 원천자료가 됩니다.",
  change: "처음 만든 SOP 만으로 대응이 부족해질 때 쓰는 기능입니다.\n\n예) 호우주의보 → 호우경보로 격상, 산불이 민가 방향으로 확산, 진화 후 복구 단계로 전환\n\n· 「관련 문서 재조회 · 추가 SOP」: 문서·조치 선택 단계로 돌아가 추가 조치를 골라 새 SOP 버전을 만듭니다. 지금까지의 실행 이력은 그대로 유지됩니다.\n· 「상황변화 메모」: 조치를 바꾸지 않고 변화 내용만 시각과 함께 기록합니다. 상황일지에 자동 반영됩니다.",
  details: "매뉴얼에서 가져온 이 조치의 세부행동입니다. 실제로 수행한 항목을 체크하면 체크한 시각과 함께 수행 기록이 남고, 조치결과를 따로 쓰지 않고 완료하면 체크한 항목이 조치결과로 자동 정리됩니다.",
  result: "이 조치를 어떻게 처리했는지 한두 줄로 남기는 공식 기록입니다. 상황일지·결과보고에 그대로 들어가므로 수치(전파 인원·투입 대수 등)를 함께 적으면 좋습니다.",
  memo: "진행 중 참고사항·현장 상황 등 공식 결과와 구분되는 메모입니다. 상황일지에는 「현장메모」로 표시됩니다.",
  branch: "상황판단 노드는 조건에 따라 다음 조치가 달라지는 갈림길입니다. 현재 상황에 맞는 분기값을 고르면 해당 연결의 조치로 진행합니다.",
};

export function RunTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
  const [selId, setSelId] = useState<string | null>(s.currentNodeId ?? null);
  const [smsOpen, setSmsOpen] = useState(false);
  const [resOpen, setResOpen] = useState(false);
  const [view, setView] = useState<"list" | "canvas">("list");
  const [libOpen, setLibOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  // 시작/종료 안내창 — running 상태 전이를 감지해 띄운다 (라이브러리 배포+즉시실행 포함)
  // 탭 진입 시점에 막 시작/종료된 경우(다른 화면에서 실행 시작 · 라이브러리 즉시실행 등)도 안내
  const [notice, setNotice] = useState<"started" | "finished" | null>(() => {
    const recent = (title: RegExp) => {
      const ev = [...s.ledger].reverse().find((e) => e.type === "run" && title.test(e.title));
      return !!ev && Date.now() - new Date(ev.at).getTime() < 20_000;
    };
    if (s.running && recent(/실행 시작/)) return "started";
    if (!s.running && recent(/종료 노드 도달/)) return "finished";
    return null;
  });
  const [seenRunning, setSeenRunning] = useState(s.running);

  const ordered = useMemo(() => (active ? orderedNodeIds(active.nodes, active.edges) : []), [active]);
  const nodes = useMemo(() => active?.nodes ?? [], [active]);
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const sel = selId ? byId(selId) : byId(s.currentNodeId ?? "") ?? nodes.find((n) => s.runs[n.id]?.status === "running");
  const selRun: NodeRun | undefined = sel ? s.runs[sel.id] : undefined;
  const stats = useMemo(() => {
    const work = nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end");
    return { total: work.length, done: work.filter((n) => s.runs[n.id]?.status === "done").length, skipped: work.filter((n) => s.runs[n.id]?.status === "skipped").length, running: work.filter((n) => s.runs[n.id]?.status === "running").length };
  }, [nodes, s.runs]);
  const endReached = useMemo(() => nodes.some((n) => n.data.kind === "end" && s.runs[n.id]?.status === "done"), [nodes, s.runs]);
  const runEvents = useMemo(() => s.ledger.filter((e) => e.type === "run"), [s.ledger]);
  const startedAt = useMemo(() => [...runEvents].reverse().find((e) => /실행 시작/.test(e.title))?.at, [runEvents]);
  const finishedAt = useMemo(() => [...runEvents].reverse().find((e) => /종료 노드 도달/.test(e.title))?.at, [runEvents]);

  // running 전이 감지 (렌더 중 상태 보정 패턴) → 시작/종료 안내창
  if (seenRunning !== s.running) {
    setSeenRunning(s.running);
    if (s.running) setNotice("started");
    else if (endReached) setNotice("finished");
  }

  if (!active)
    return (
      <div className="p-[28rem]">
        <EmptyState icon={<IconPlay size={28} />} title="실행할 SOP가 없습니다" desc="라이브러리에 게시된 SOP 를 선택해 바로 실행하거나, SOP 구성·편집 단계에서 이 상황 전용 SOP 를 만들고 실행본으로 확정하세요."
          action={<Button leftIcon={<IconPlay size={16} />} onClick={() => setLibOpen(true)}>라이브러리에서 선택해 바로 실행</Button>} />
        <LibraryPicker open={libOpen} onClose={() => setLibOpen(false)} disasterType={s.disasterType} onDeployed={(tid, start) => { const vid = st.deployTemplate(s.id, tid, { start }); setLibOpen(false); if (vid) toast.success(start ? "배포 후 실행을 시작했습니다" : "실행본으로 배포했습니다"); }} />
      </div>
    );
  const isConfirmed = active.kind === "confirmed";
  const firstNode = (() => { const start = nodes.find((n) => n.data.kind === "start"); const e = active.edges.find((x) => x.source === start?.id); return e ? byId(e.target) : undefined; })();
  const currentNode = s.currentNodeId ? byId(s.currentNodeId) : undefined;
  const duration = startedAt && finishedAt ? Math.max(1, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000)) : undefined;

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-[1fr_1.15fr] gap-[20rem]">
      {/* 좌: 기준 SOP */}
      <Card
        padded={false}
        className="flex flex-col min-h-[560px]"
        title={<span className="inline-flex items-center gap-[8rem]">기준 SOP (v{active.version}) <Help size="lg" title="기준 SOP · 목록/플로우" text={HELP.baseSop} /> {s.running ? <DsBadge label="실행 중" color="success" variant="dot-accent" size="xs" /> : endReached ? <DsBadge label="완료" color="success" variant="solid" size="xs" /> : <DsBadge label="대기" color="grayscale" variant="dot-neutral" size="xs" />}</span>}
        subtitle={`S09 · ${stats.done}/${stats.total} 완료${stats.skipped ? ` · ${stats.skipped} 생략` : ""} · 진행 ${stats.running}`}
        right={
          <div className="flex gap-[8rem] items-center">
            <SegmentedControl value={view} setValue={setView} options={[{ value: "list", label: "목록" }, { value: "canvas", label: "플로우" }]} size="sm" fitContent />
            {!s.running ? (
              <Button size="sm" variant="success" leftIcon={<IconPlay size={16} />} disabled={endReached} onClick={() => { if (!isConfirmed) return toast.error("실행본으로 확정된 버전만 실행할 수 있습니다"); setStartOpen(true); }}>
                {endReached ? "실행 완료" : Object.keys(s.runs).length ? "실행 재개" : "실행 시작"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" leftIcon={<IconStop size={16} />} onClick={() => setStopOpen(true)}>중지</Button>
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
              const checks = Object.keys(r?.checks ?? {}).length;
              const detailCount = n.data.details?.length ?? 0;
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
                      {detailCount > 0 && status !== "skipped" && <span className={cn(checks === detailCount && checks > 0 && "text-[var(--color-text-success)] font-medium")}>세부행동 {checks}/{detailCount}</span>}
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
          /* 플로우 뷰 — ReactFlow 는 부모의 확정 높이가 필요하므로 명시 높이를 준다 */
          <div className="relative h-[640px] border-t border-[var(--color-border-subtle)]">
            <ReactFlowProvider>
              <SopCanvas nodes={active.nodes} edges={active.edges} runStatus={s.runs} currentNodeId={s.currentNodeId} readOnly onSelect={(n) => n && setSelId(n)} fitKey={1} />
            </ReactFlowProvider>
            <div className="absolute left-[12rem] top-[12rem] inline-flex items-center gap-[6rem] rounded-lg bg-[var(--color-surface-primary)]/95 border border-[var(--color-border-subtle)] px-[10rem] h-[28rem] typo-body-sm text-[var(--color-text-secondary)] shadow-[var(--elevation-01)] pointer-events-none">
              <IconClick size={14} /> 노드를 클릭하면 우측에서 처리합니다 · 초록 테두리 = 현재 조치
            </div>
            {currentNode && s.running && (
              <button onClick={() => setSelId(currentNode.id)} className="absolute right-[12rem] top-[12rem] inline-flex items-center gap-[6rem] rounded-lg bg-[var(--color-surface-success)] text-white px-[10rem] h-[28rem] typo-body-sm font-medium shadow-[var(--elevation-02)] hover:brightness-95">
                현재: {currentNode.data.title} <IconArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </Card>

      {/* 우: 현재 노드 처리 + 타임라인 */}
      <div className="space-y-[20rem]">
        {sel ? <NodeWork key={sel.id} s={s} node={sel} run={selRun} onSms={() => setSmsOpen(true)} onRes={() => setResOpen(true)} /> : <Card><EmptyState size="sm" icon={<IconDocsCheck size={28} />} title="노드를 선택하세요" desc="좌측 목록 또는 플로우에서 처리할 조치를 선택하면 세부행동 체크·조치결과·현장메모·전파·자원 입력을 할 수 있습니다." /></Card>}

        <Card title={<span className="inline-flex items-center gap-[6rem]">실제 수행 타임라인 <Help size="lg" title="실제 수행 타임라인" text={HELP.timeline} direction="right" /></span>} subtitle="기준 SOP ↔ 실제 수행 비교 (UFR-005-002)" right={<Button size="sm" variant="outline" rightIcon={<IconArrowRight size={16} />} onClick={onNext}>상황일지로</Button>}>
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
            {runEvents.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">실행 기록이 없습니다</div>}
          </div>
        </Card>

        <Card
          title={<span className="inline-flex items-center gap-[6rem]">상황 변화 대응 <Help size="lg" title="상황 변화 대응이란?" text={HELP.change} direction="right" /></span>}
          subtitle="상황이 확대되거나 복구 단계로 바뀌면 추가 SOP 를 구성하거나 변화 내용을 메모로 남깁니다 (S11). 기존 실행이력은 유지됩니다."
        >
          <div className="flex gap-[8rem] flex-wrap">
            <Link href={`/situations/${s.id}?tab=docs`}><Button variant="outline" size="sm" leftIcon={<IconDocsCheck size={16} />}>관련 문서 재조회 · 추가 SOP</Button></Link>
            <Button variant="outline" size="sm" leftIcon={<IconRefresh size={16} />} onClick={() => { setMemoText(""); setMemoOpen(true); }}>상황변화 메모</Button>
          </div>
        </Card>
      </div>

      {sel && <SmsModal open={smsOpen} onClose={() => setSmsOpen(false)} s={s} node={sel} />}
      {sel && <ResourceModal open={resOpen} onClose={() => setResOpen(false)} s={s} node={sel} />}

      {/* 상황변화 메모 */}
      <Modal open={memoOpen} onClose={() => setMemoOpen(false)} title="상황변화 메모" description="조치를 바꾸지 않고 상황 변화 내용만 시각과 함께 기록합니다. 상황일지에 「입력」 항목으로 반영됩니다." size="sm"
        footer={<><Button variant="ghost" onClick={() => setMemoOpen(false)}>취소</Button><Button leftIcon={<IconMemo size={16} />} onClick={() => { if (!memoText.trim()) return toast.error("내용을 입력하세요"); st.addLedger(s.id, { type: "user", title: "상황 변화 기록", body: memoText.trim(), source: "user", verify: "confirmed" }); setMemoOpen(false); toast.success("상황 변화를 기록했습니다"); }}>기록</Button></>}>
        <TextArea label="변화 내용" minHeight={100} value={memoText} onChange={(e) => setMemoText(e.target.value)} placeholder="예) 14:20 산불 확산으로 위기경보 「주의」→「경계」 격상. 인근 마을 2개 사전대피 검토" />
      </Modal>

      {/* 실행 시작 확인 */}
      <Modal open={startOpen} onClose={() => setStartOpen(false)} title={Object.keys(s.runs).length ? "SOP 실행 재개" : "SOP 실행 시작"} intent="success" size="sm"
        description="실행을 시작하면 시작 노드가 자동 완료되고 첫 조치가 「진행 중」이 됩니다. 이후 조치를 완료할 때마다 다음 조치로 자동 진행됩니다."
        footer={<><Button variant="ghost" onClick={() => setStartOpen(false)}>취소</Button><Button variant="success" leftIcon={<IconPlay size={16} />} onClick={() => { setStartOpen(false); st.startRun(s.id); }}>실행 시작</Button></>}>
        <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem] space-y-[6rem] typo-body-sm text-[var(--color-text-basic)]">
          <Row k="실행 SOP" v={`v${active.version} · ${active.label}`} />
          <Row k="조치 수" v={`${stats.total}개 (상황판단 ${nodes.filter((n) => n.data.kind === "decision").length}개)`} />
          <Row k="첫 조치" v={firstNode?.data.title ?? "-"} />
          <Row k="실행 담당" v={`${st.user.name} (${st.user.dept})`} />
          <Row k="시작 시각" v={fmtDateTime(nowIso())} />
        </div>
      </Modal>

      {/* 중지 확인 */}
      <Modal open={stopOpen} onClose={() => setStopOpen(false)} title="SOP 실행 중지" intent="warning" size="sm" description="실행을 잠시 멈춥니다. 지금까지의 조치 기록은 모두 유지되며 「실행 재개」로 이어서 진행할 수 있습니다."
        footer={<><Button variant="ghost" onClick={() => setStopOpen(false)}>계속 실행</Button><Button variant="danger" leftIcon={<IconStop size={16} />} onClick={() => { setStopOpen(false); st.stopRun(s.id); toast.info("SOP 실행을 중지했습니다 — 「실행 재개」로 이어서 진행할 수 있습니다"); }}>중지</Button></>}>
        <div className="typo-body-md text-[var(--color-text-secondary)]">완료 {stats.done} / 전체 {stats.total} · 진행 중 {stats.running}{currentNode ? ` · 현재 조치 「${currentNode.data.title}」` : ""}</div>
      </Modal>

      {/* 시작 안내 */}
      <Modal open={notice === "started"} onClose={() => setNotice(null)} title="SOP 실행이 시작되었습니다" intent="success" size="sm"
        footer={<Button variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => { setNotice(null); if (currentNode) setSelId(currentNode.id); }}>확인 · 첫 조치로</Button>}>
        <div className="space-y-[12rem]">
          <div className="flex items-center gap-[12rem]">
            <span className="size-[44rem] rounded-xl grid place-items-center bg-[var(--color-surface-success-subtle)] text-[var(--color-icon-success)] shrink-0"><IconPlay size={24} /></span>
            <div>
              <div className="typo-body-lg font-medium text-[var(--color-text-primary)]">{fmtDateTime(startedAt ?? nowIso())} · v{active.version} 실행본</div>
              <div className="typo-body-sm text-[var(--color-text-tertiary)]">조치 {stats.total}개 · 실행 담당 {st.user.name}</div>
            </div>
          </div>
          <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem] typo-body-sm leading-relaxed text-[var(--color-text-basic)]">
            <div className="font-medium text-[var(--color-text-primary)] mb-[4rem]">지금 진행 중인 조치</div>
            {currentNode ? <div className="flex items-center gap-[8rem]"><Badge tone={KIND_TONE[currentNode.data.kind]}>{KIND_LABEL[currentNode.data.kind]}</Badge><span className="font-medium">{currentNode.data.title}</span>{currentNode.data.leadDept && <span className="text-[var(--color-text-tertiary)]">· {currentNode.data.leadDept}</span>}</div> : "-"}
            <ol className="list-decimal pl-[18rem] mt-[10rem] space-y-[2rem] text-[var(--color-text-secondary)]">
              <li>좌측 목록/플로우에서 조치를 선택합니다.</li>
              <li>세부행동을 체크하고 조치결과를 입력한 뒤 「완료」를 누르면 다음 조치로 자동 진행됩니다.</li>
              <li>모든 조치가 끝나면 종료 안내와 함께 상황일지 작성으로 넘어갑니다.</li>
            </ol>
          </div>
        </div>
      </Modal>

      {/* 종료 안내 */}
      <Modal open={notice === "finished"} onClose={() => setNotice(null)} title="SOP 실행이 완료되었습니다" intent="success" size="sm"
        footer={<><Button variant="ghost" onClick={() => setNotice(null)}>닫기</Button><Button rightIcon={<IconArrowRight size={16} />} onClick={() => { setNotice(null); onNext(); }}>상황일지 작성으로</Button></>}>
        <div className="space-y-[12rem]">
          <div className="flex items-center gap-[12rem]">
            <span className="size-[44rem] rounded-xl grid place-items-center bg-[var(--color-surface-success-subtle)] text-[var(--color-icon-success)] shrink-0"><IconCheckCircle size={24} /></span>
            <div>
              <div className="typo-body-lg font-medium text-[var(--color-text-primary)]">종료 노드에 도달했습니다</div>
              <div className="typo-body-sm text-[var(--color-text-tertiary)]">{startedAt ? `${fmtDateTime(startedAt)} 시작` : ""}{finishedAt ? ` → ${fmtDateTime(finishedAt)} 종료` : ""}{duration ? ` · 소요 ${duration}분` : ""}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[8rem]">
            <Tile k="완료" v={stats.done} tone="success" />
            <Tile k="생략" v={stats.skipped} tone="gray" />
            <Tile k="SMS · 자원" v={`${s.sms.length} · ${s.resources.length}`} tone="brand" />
          </div>
          <div className="typo-body-sm text-[var(--color-text-secondary)] leading-relaxed">모든 조치 기록이 원장에 저장되었습니다. 이어서 상황일지 초안을 생성하고 결과보고서를 작성하세요. 상황이 다시 변하면 「상황 변화 대응」으로 추가 SOP 를 구성할 수 있습니다.</div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-[12rem]"><span className="w-[72rem] shrink-0 text-[var(--color-text-tertiary)]">{k}</span><span className="font-medium text-[var(--color-text-primary)]">{v}</span></div>;
}
function Tile({ k, v, tone }: { k: string; v: string | number; tone: "success" | "gray" | "brand" }) {
  const cls = { success: "bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]", gray: "bg-[var(--color-surface-gray-subtle)] text-[var(--color-text-secondary)]", brand: "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]" }[tone];
  return <div className={cn("rounded-xl p-[10rem] text-center", cls)}><div className="typo-title-sm font-bold leading-none">{v}</div><div className="typo-body-sm mt-[4rem] opacity-80">{k}</div></div>;
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
  const [emptyConfirm, setEmptyConfirm] = useState(false);
  const terminal = d.kind === "start" || d.kind === "end";
  const saveFields = (extra?: Partial<NodeRun>) => st.updateRun(s.id, node.id, { result: result || undefined, fieldMemo: memo || undefined, assignee, ...extra });
  const nodeSms = s.sms.filter((m) => m.nodeId === node.id);
  const nodeRes = s.resources.filter((r) => r.nodeId === node.id);
  const activeVer = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
  const branchTargets = activeVer?.edges.filter((e) => e.source === node.id && (e.label ?? "") === branch).map((e) => activeVer.nodes.find((n) => n.id === e.target)?.data.title ?? e.target) ?? [];
  const details = d.details ?? [];
  const checks = run?.checks ?? {};
  const checkedCount = details.filter((_, i) => checks[String(i)]).length;
  const locked = status === "done" || status === "skipped";

  /** 체크한 세부행동을 조치결과 문장으로 정리 */
  const summarizeChecks = () => {
    const done = details.filter((_, i) => checks[String(i)]);
    if (!done.length) return "";
    return `세부행동 ${done.length}/${details.length} 수행 — ${done.map((x) => x.replace(/\s+/g, " ").trim()).join("; ")}`;
  };
  const doComplete = (finalResult: string) => {
    saveFields({ result: finalResult || undefined });
    st.completeNode(s.id, node.id, finalResult || undefined, d.kind === "decision" ? branch : undefined);
    toast.success(d.kind === "decision" ? `분기 "${branch}" 로 진행` : "조치를 완료했습니다");
  };
  const complete = () => {
    if (d.kind === "decision") {
      if (!branch) return toast.error("분기값을 선택하세요");
      return doComplete("");
    }
    if (result.trim()) return doComplete(result.trim());
    const auto = summarizeChecks();
    if (auto) {
      setResult(auto);
      return doComplete(auto);
    }
    setEmptyConfirm(true);
  };

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
          {details.length > 0 && (
            <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
              <div className="flex items-center gap-[6rem] mb-[8rem]">
                <span className="label">세부행동 체크 (매뉴얼 자동입력)</span>
                <Help size="lg" title="세부행동 체크" text={HELP.details} direction="right" />
                <span className={cn("ml-auto typo-body-sm font-medium", checkedCount === details.length ? "text-[var(--color-text-success)]" : "text-[var(--color-text-tertiary)]")}>{checkedCount}/{details.length}</span>
              </div>
              <div className="h-[4rem] rounded-max bg-[var(--color-surface-muted)] overflow-hidden mb-[10rem]"><div className="h-full bg-[var(--color-surface-success)] transition-all" style={{ width: `${details.length ? (checkedCount / details.length) * 100 : 0}%` }} /></div>
              <ul className="space-y-[6rem]">
                {details.map((x, i) => {
                  const at = checks[String(i)];
                  return (
                    <li key={i} className={cn("flex items-start gap-[8rem] rounded-lg px-[8rem] py-[6rem] -mx-[8rem] transition", at ? "bg-[var(--color-surface-success-subtle)]/60" : "hover:bg-[var(--color-surface-primary)]")}>
                      <DsCheckbox checked={!!at} disabled={locked} onCheckedChange={(v) => st.toggleDetailCheck(s.id, node.id, i, !!v)} size="sm" className="mt-[1px]" />
                      <button type="button" disabled={locked} onClick={() => st.toggleDetailCheck(s.id, node.id, i, !at)} className={cn("flex-1 text-left typo-body-sm leading-relaxed text-[var(--color-text-basic)]", at && "text-[var(--color-text-secondary)]")}>
                        {x}
                        {at && <span className="ml-[6rem] inline-flex items-center gap-[2rem] typo-body-sm text-[var(--color-text-success)] font-medium whitespace-nowrap"><IconClock size={12} />{fmtTime(at)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(d.targets?.length || d.resources?.length) ? (
                <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[10rem] pt-[8rem] border-t border-[var(--color-border-subtle)] flex gap-[12rem] flex-wrap">
                  {d.targets?.length ? <span>전파대상: {d.targets.join(", ")}</span> : null}
                  {d.resources?.length ? <span>필요자원: {d.resources.join(", ")}</span> : null}
                </div>
              ) : null}
            </div>
          )}

          {d.kind === "decision" ? (
            <div className="rounded-xl border border-[var(--yellow-75)] bg-[var(--yellow-20)] p-[16rem]">
              <div className="typo-body-md font-medium text-[var(--yellow-700)] flex items-center gap-[6rem]"><IconNodeDecision size={16} /> 분기값 선택 (UFR-005-010) <Help size="lg" title="상황판단 · 분기값" text={HELP.branch} /></div>
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
              <div>
                <TextArea label="조치결과 (UFR-005-005) *" minHeight={84} value={result} onChange={(e) => setResult(e.target.value)} onBlur={() => saveFields()} placeholder="예) 구·군 상황실 및 재난공무원 UMS 전파 완료(수신 1,240명)" helperText="상황일지·결과보고의 핵심 원천자료. 비워 두고 완료하면 체크한 세부행동이 자동 정리됩니다." intent={result ? "complete" : "default"} />
                {checkedCount > 0 && !result && !locked && <button type="button" className="mt-[6rem] typo-body-sm text-[var(--color-text-brand)] underline" onClick={() => setResult(summarizeChecks())}>체크한 세부행동 {checkedCount}건을 조치결과로 채우기</button>}
              </div>
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
            {!locked && (
              <Button variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={complete}>{d.kind === "decision" ? "분기 확정·다음으로" : "완료"}</Button>
            )}
            {!locked && <Button variant="ghost" leftIcon={<IconSkip size={16} />} onClick={() => st.skipNode(s.id, node.id)}>생략</Button>}
            {status === "done" && <Button variant="outline" leftIcon={<IconMemo size={16} />} onClick={() => { saveFields(); toast.success("조치결과를 수정했습니다"); st.addLedger(s.id, { type: "result", title: `조치결과 수정: ${d.title}`, body: result, source: "user", verify: "confirmed", refId: node.id }); }}>결과 수정 저장</Button>}
          </div>
        </div>
      )}

      <Modal open={emptyConfirm} onClose={() => setEmptyConfirm(false)} title="조치결과 없이 완료할까요?" intent="warning" size="sm" description="조치결과와 체크한 세부행동이 모두 없습니다. 상황일지에는 「조치 완료」만 기록됩니다."
        footer={<><Button variant="ghost" onClick={() => setEmptyConfirm(false)}>돌아가서 입력</Button><Button variant="success" onClick={() => { setEmptyConfirm(false); doComplete(""); }}>결과 없이 완료</Button></>}>
        <div className="typo-body-sm text-[var(--color-text-tertiary)]">권장: 세부행동을 체크하거나 조치결과를 한 줄이라도 남겨 두세요.</div>
      </Modal>
    </Card>
  );
}

// ── SMS 모달 (조직·연락처 연동) ─────────────────────────────────────────────
function SmsModal({ open, onClose, s, node }: { open: boolean; onClose: () => void; s: Situation; node: SopNode }) {
  const toast = useToast();
  const st = useAppStore();
  const contacts = st.contacts;
  const spread = node.data.subMissions.find((m) => m.type === "spread");
  const [recipients, setRecipients] = useState((node.data.targets ?? []).join(", "));
  const [message, setMessage] = useState(spread?.spreadContent ?? `[${s.organization} 재대본] ${node.data.title} 관련 안내입니다.`);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const depts = useMemo(() => Array.from(new Set(contacts.map((c) => c.dept))).sort(), [contacts]);
  const visible = useMemo(() => contacts.filter((c) => (!deptFilter || c.dept === deptFilter) && (!q || `${c.name}${c.position}${c.dept}${c.phone}`.includes(q))), [contacts, deptFilter, q]);
  const label = (c: Contact) => `${c.name} ${c.position}(${c.dept}, ${c.phone})`;
  const togglePick = (c: Contact) => {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(c.id)) n.delete(c.id);
      else n.add(c.id);
      return n;
    });
  };
  const applyPicked = () => {
    const names = contacts.filter((c) => picked.has(c.id)).map(label);
    const cur = recipients.split(",").map((x) => x.trim()).filter(Boolean);
    setRecipients(Array.from(new Set([...cur, ...names])).join(", "));
    toast.success(`${names.length}명을 수신대상에 추가했습니다`);
  };
  const pickDept = (dept: string) => {
    setPicked((p) => {
      const n = new Set(p);
      contacts.filter((c) => c.dept === dept).forEach((c) => n.add(c.id));
      return n;
    });
  };
  return (
    <Modal open={open} onClose={onClose} title="상황전파 SMS 발송" description="UFR-006-001/002 · T3Q 전파대상은 추천정보이며 실제 수신자는 사용자가 확정합니다. 발송이력은 SOP 조치와 연결되어 상황일지·결과보고에 반영됩니다." size="lg" footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button leftIcon={<IconSend size={16} />} onClick={() => { const rs = recipients.split(",").map((x) => x.trim()).filter(Boolean); if (!rs.length || !message.trim()) return toast.error("수신대상과 문안을 입력하세요"); st.addSms(s.id, { nodeId: node.id, recipients: rs, message }); toast.success("SMS를 발송했습니다 (UNE SMS 모듈 모의)"); onClose(); }}>발송</Button></>}>
      <div className="grid md:grid-cols-[1fr_300px] gap-[16rem]">
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
        {/* 조직·연락처에서 선택 */}
        <div className="rounded-xl border border-[var(--color-border-subtle)] flex flex-col min-h-[300px] max-h-[420px]">
          <div className="px-[12rem] pt-[10rem] pb-[8rem] border-b border-[var(--color-border-subtle)]">
            <div className="flex items-center gap-[6rem] typo-body-sm font-medium text-[var(--color-text-primary)]"><IconPerson size={16} /> 조직·연락처에서 선택 <span className="ml-auto text-[var(--color-text-tertiary)] font-normal">{picked.size}명</span></div>
            {contacts.length > 0 ? (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·직위·부서 검색" className="mt-[8rem] w-full h-[28rem] px-[8rem] rounded-md border border-[var(--color-border-default)] typo-body-sm bg-[var(--color-surface-primary)] outline-none focus:border-[var(--color-border-brand)]" />
                <div className="flex gap-[4rem] flex-wrap mt-[8rem]">
                  <ChoiceChip label="전체" size="sm" variant="outline" selected={!deptFilter} onClick={() => setDeptFilter(null)} />
                  {depts.map((dp) => <ChoiceChip key={dp} label={dp} size="sm" variant="outline" selected={deptFilter === dp} onClick={() => setDeptFilter(deptFilter === dp ? null : dp)} />)}
                </div>
              </>
            ) : (
              <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[6rem] leading-relaxed">등록된 연락처가 없습니다. <Link href="/settings/org" className="text-[var(--color-text-brand)] underline">설정 › 조직·연락처 관리</Link>에서 등록하거나 엑셀로 일괄 업로드하세요.</div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {visible.map((c) => (
              <label key={c.id} className={cn("flex items-start gap-[8rem] px-[12rem] py-[6rem] border-b border-[var(--color-border-subtle)] cursor-pointer hover:bg-[var(--color-surface-subtle)]", picked.has(c.id) && "bg-[var(--color-surface-brand-subtle)]")}>
                <DsCheckbox checked={picked.has(c.id)} onCheckedChange={() => togglePick(c)} size="sm" className="mt-[1px]" />
                <span className="min-w-0 flex-1">
                  <span className="typo-body-sm font-medium text-[var(--color-text-primary)]">{c.name} <span className="font-normal text-[var(--color-text-tertiary)]">{c.position}</span></span>
                  <span className="block typo-body-sm text-[var(--color-text-tertiary)] truncate">{c.dept} · {c.phone}</span>
                </span>
              </label>
            ))}
          </div>
          {contacts.length > 0 && (
            <div className="p-[8rem] border-t border-[var(--color-border-subtle)] flex gap-[6rem]">
              {deptFilter && <Button size="xs" variant="ghost" onClick={() => pickDept(deptFilter)}>{deptFilter} 전체 선택</Button>}
              <Button size="xs" className="ml-auto" disabled={!picked.size} onClick={applyPicked}>수신대상에 추가</Button>
            </div>
          )}
        </div>
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
  const INTERNAL = s.disasterType === "wildfire"
    ? ["진화차", "산불진화헬기", "등짐펌프", "산불진화기계화시스템", "무인기(드론)", "급수차", "굴삭기", "구호물품세트", "산불감시원", "산불전문예방진화대", "응급복구 인력"]
    : ["양수기", "배수펌프", "비상발전기", "모래주머니", "덤프트럭", "굴삭기", "살수차", "비상급수차", "제설차", "염화칼슘", "구호물품세트", "예찰 인력", "응급복구 인력"];
  return (
    <Modal open={open} onClose={onClose} title="재난자원 투입 등록" description="UFR-006-004~006 · 수기/내부/KRMS 출처를 구분해 동일 자원 객체로 관리합니다." size="md" footer={<><Button variant="ghost" onClick={onClose}>취소</Button><Button leftIcon={<IconStorage size={16} />} onClick={() => { if (!name.trim()) return toast.error("자원명을 입력하세요"); st.addResource(s.id, { nodeId: node.id, name: name.trim(), category, qty, unit, source }); toast.success("자원 투입을 등록했습니다"); onClose(); }}>등록</Button></>}>
      <div className="space-y-[12rem]">
        <SegmentedControl value={source} setValue={(v) => { const nv = typeof v === "function" ? v(source) : v; if (nv !== "KRMS") setSource(nv); }} options={[{ value: "manual", label: "수기 입력" }, { value: "internal", label: "내부 자원목록" }, { value: "KRMS", label: "KRMS (연계 예정)", disabled: true }]} fullWidth />
        {source === "internal" && (
          <div className="flex flex-wrap gap-[6rem]">
            {INTERNAL.map((x) => <ChoiceChip key={x} label={x} size="sm" variant="outline" selected={name === x} onClick={() => { setName(x); setCategory(/인력|감시원|진화대/.test(x) ? "인력" : /주머니|염화|물품/.test(x) ? "자재" : "장비"); setUnit(/인력|감시원|진화대/.test(x) ? "명" : /주머니|물품/.test(x) ? "개" : /염화/.test(x) ? "톤" : "대"); }} />)}
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

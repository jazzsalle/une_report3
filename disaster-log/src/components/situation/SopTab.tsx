"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { IconButton, Badge as DsBadge, Checkbox as DsCheckbox } from "@une-front/react-ui";
import type { NodeKind, Situation, SopEdge, SopNode, SubMission } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Dots, EmptyState, Modal, SelectBox, TextArea, TextInput, useToast } from "@/components/ui";
import { IconAi, IconPlus, IconNodeDecision, IconAnnounce, IconStorage, IconPlay, IconCheckCircle, IconArrowRight, IconClock, IconTrash, IconStop, IconArrowUp, IconInfo, IconNodeProcess } from "@/components/icons";
import { SopCanvas } from "@/components/sop/SopCanvas";
import { streamSopGeneration, type StreamMeta } from "@/lib/ai/stream";
import { toEdges, toNode } from "@/lib/sop/converters";
import { NODE_SIZE, type CompnSaveParams } from "@/lib/sop/compn";
import { cn, fmtDateTime, uid } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { searching: "관련 정보 검색 중", reranking: "정보 우선순위 정렬 중", generating: "SOP 생성 중", end: "생성 완료" };
const KIND_LABEL: Record<NodeKind, string> = { start: "시작", end: "종료", process: "프로세스", decision: "상황판단", spread: "상황전파", resource: "자원" };

export function SopTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  return (
    <ReactFlowProvider>
      <SopTabInner s={s} onNext={onNext} />
    </ReactFlowProvider>
  );
}

function SopTabInner({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
  const [selId, setSelId] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNote, setConfirmNote] = useState("");

  // AI 생성 상태 (원본 AiGenerateButton 흐름 이식)
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [preview, setPreview] = useState<CompnSaveParams[]>([]);
  const compnsRef = useRef<CompnSaveParams[]>([]);
  const actionsRef = useRef<Record<number, unknown>>({});
  const abortRef = useRef<AbortController | null>(null);
  const isGenerating = llmStatus !== null && llmStatus !== "end";

  const nodes = active?.nodes ?? [];
  const edges = active?.edges ?? [];
  const selNode = nodes.find((n) => n.id === selId);

  const onCanvasChange = useCallback(
    (n: SopNode[], e: SopEdge[]) => {
      if (isGenerating) return;
      st.updateSopFlow(s.id, n, e);
    },
    [s.id, st, isGenerating],
  );

  const patchNode = (id: string, fn: (n: SopNode) => SopNode) => st.updateSopFlow(s.id, nodes.map((n) => (n.id === id ? fn(n) : n)), edges);
  const patchEdge = (id: string, patch: Partial<SopEdge>) => st.updateSopFlow(s.id, nodes, edges.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const addNode = (kind: NodeKind) => {
    if (!active) return;
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0);
    const anchor = selNode ?? nodes.find((n) => n.data.kind === "end") ?? nodes[nodes.length - 1];
    const id = uid("n");
    const size = NODE_SIZE[kind];
    const newNode: SopNode = {
      id,
      type: "sop",
      position: { x: (anchor?.position.x ?? 120) + (selNode ? 320 : 0), y: selNode ? selNode.position.y : maxY + 150 },
      width: size.w,
      height: size.h,
      data: { kind, title: kind === "decision" ? "상황판단: 조건 입력" : kind === "spread" ? "상황전파" : kind === "resource" ? "자원 투입" : "새 프로세스", autoRun: false, subMissions: [], branches: kind === "decision" ? ["예", "아니오"] : undefined, ui: {} },
    };
    let newEdges = edges;
    if (selNode && selNode.data.kind !== "end") {
      newEdges = [...edges, { id: `xy-edge__${selNode.id}${selNode.data.kind === "decision" ? "right" : "bottom"}-${id}top`, source: selNode.id, target: id, sourceHandle: selNode.data.kind === "decision" ? "right" : "bottom", targetHandle: "top", label: selNode.data.kind === "decision" ? selNode.data.branches?.[1] : undefined }];
    }
    st.updateSopFlow(s.id, [...nodes, newNode], newEdges);
    setSelId(id);
    toast.info(`${KIND_LABEL[kind]} 노드를 추가했습니다`);
  };

  const deleteSelected = () => {
    if (selId) {
      const n = nodes.find((x) => x.id === selId);
      if (n?.data.kind === "start") return toast.error("시작 노드는 삭제할 수 없습니다");
      st.updateSopFlow(s.id, nodes.filter((x) => x.id !== selId), edges.filter((e) => e.source !== selId && e.target !== selId));
      setSelId(null);
    } else if (selEdge) {
      st.updateSopFlow(s.id, nodes, edges.filter((e) => e.id !== selEdge));
      setSelEdge(null);
    }
  };

  // AI 자유생성 (UNI /chat/json → SSE __compn__)
  const handleGenerate = async (q: string) => {
    if (!q.trim() || isGenerating) return;
    setSubmitted(q);
    setPreview([]);
    compnsRef.current = [];
    actionsRef.current = {};
    setMeta(null);
    setLlmStatus("searching");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamSopGeneration(
        q,
        { disasterType: s.disasterType, organization: s.organization },
        {
          onMeta: setMeta,
          onStatus: (v) => setLlmStatus(v),
          onError: (e) => toast.error(e),
          onCompn: (c, action) => {
            const compn = c as CompnSaveParams;
            compnsRef.current = [...compnsRef.current, compn];
            if (action) actionsRef.current[compn.CompnSn] = action;
            setPreview([...compnsRef.current]);
          },
        },
        ctrl.signal,
      );
      setLlmStatus("end");
      if (compnsRef.current.length > 0) {
        const all = compnsRef.current;
        const nn = all.map((c) => toNode(c, actionsRef.current[c.CompnSn] as never));
        const ee = toEdges(all);
        const activate = !s.running;
        st.addSopVersion(s.id, { label: `AI 자유생성 (${meta?.source === "uni" ? "UNI RAG" : "로컬 Seed"})`, kind: "recommended", nodes: nn, edges: ee, note: `쿼리: ${q}` }, activate);
        toast.success(activate ? `SOP 자동 생성 완료 · ${all.length}개 컴포넌트` : "새 SOP 버전을 생성했습니다 (실행 중인 버전은 유지). 버전 목록에서 전환할 수 있습니다");
        setFitKey((k) => k + 1);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
      setLlmStatus(null);
    }
  };
  const handleStop = () => {
    abortRef.current?.abort();
    setLlmStatus(null);
    setPreview([]);
    compnsRef.current = [];
  };

  const decisionCount = nodes.filter((n) => n.data.kind === "decision").length;
  const aiModal = <AiModal open={aiOpen} onClose={() => setAiOpen(false)} query={query} setQuery={setQuery} submitted={submitted} status={llmStatus} preview={preview} meta={meta} isGenerating={isGenerating} onGenerate={handleGenerate} onStop={handleStop} />;

  if (!active) {
    return (
      <div className="p-[28rem]">
        <EmptyState icon={<IconFlow2 />} title="구성된 SOP가 없습니다" desc="문서·조치 선택 단계에서 조치를 선택하면 기본 순차 Flow가 자동 구성됩니다. 또는 자연어로 상황을 설명해 AI SOP를 생성할 수 있습니다." action={<Button leftIcon={<IconAi size={16} />} onClick={() => setAiOpen(true)}>AI SOP 자유생성</Button>} />
        {aiModal}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-215px)] min-h-[640px]">
      {/* Toolbar */}
      <div className="no-print flex items-center gap-[8rem] px-[20rem] py-[10rem] bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] flex-wrap">
        <span className="typo-body-sm font-medium text-[var(--color-text-tertiary)] mr-[4rem]">노드 추가</span>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconNodeProcess size={16} />} onClick={() => addNode("process")}>프로세스</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconNodeDecision size={16} className="text-[var(--yellow-500)]" />} onClick={() => addNode("decision")}>상황판단</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconAnnounce size={16} className="text-[var(--purple-600)]" />} onClick={() => addNode("spread")}>상황전파</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconStorage size={16} className="text-[var(--color-icon-success)]" />} onClick={() => addNode("resource")}>자원</Button>
        <Button size="sm" variant="ghost" disabled={isGenerating || (!selId && !selEdge)} leftIcon={<IconTrash size={16} />} onClick={deleteSelected}>삭제</Button>
        <span className="w-px h-[24rem] bg-[var(--color-border-default)] mx-[4rem]" />
        <Button size="sm" disabled={isGenerating} leftIcon={<IconAi size={16} />} onClick={() => setAiOpen(true)}>AI 생성</Button>
        <div className="ml-auto flex items-center gap-[8rem]">
          <div className="w-[260rem]">
            <SelectBox size="xs" value={active.id} onChange={(v) => st.setActiveSop(s.id, v)} options={s.sopVersions.map((v) => ({ value: v.id, label: `v${v.version} · ${v.label}` }))} />
          </div>
          <DsBadge label={active.kind === "confirmed" ? "실행본" : active.kind === "edited" ? "수정본" : "추천 원본"} color={active.kind === "confirmed" ? "success" : active.kind === "edited" ? "light-warning" : "primary"} variant="solid-pastel" size="sm" />
          {active.kind !== "confirmed" ? (
            <Button size="sm" variant="success" disabled={isGenerating} leftIcon={<IconCheckCircle size={16} />} onClick={() => setConfirmOpen(true)}>실행본 확정</Button>
          ) : (
            <Button size="sm" rightIcon={<IconArrowRight size={16} />} onClick={onNext}>실행으로 이동</Button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px]">
        <div className="relative min-h-[420px]">
          <SopCanvas nodes={nodes} edges={edges} readOnly={isGenerating} onChange={onCanvasChange} onSelect={(n, e) => { setSelId(n); setSelEdge(e); }} fitKey={fitKey} />
          {isGenerating && (
            <div className="absolute left-[16rem] top-[16rem] flex items-center gap-[8rem] bg-[var(--color-surface-primary)] border border-[var(--color-border-subtle)] rounded-xl px-[12rem] py-[8rem] shadow-[var(--elevation-03)]">
              <IconAi size={16} className="text-[var(--color-icon-brand)] pulse-soft" />
              <span className="typo-body-sm font-medium">AI SOP 생성 중 · {STATUS_LABEL[llmStatus ?? ""] ?? llmStatus}<Dots /></span>
              <IconButton icon={<IconStop size={16} />} variant="ghost" color="grayscale" size="3xs" aria-label="정지" onClick={handleStop} />
            </div>
          )}
          <div className="absolute right-[16rem] top-[16rem] flex gap-[6rem] flex-wrap justify-end max-w-[60%]">
            <DsBadge label={`노드 ${nodes.length}`} color="grayscale" variant="solid-pastel" size="xs" />
            <DsBadge label={`연결 ${edges.length}`} color="grayscale" variant="solid-pastel" size="xs" />
            {decisionCount > 0 && <DsBadge label={`상황판단 ${decisionCount}`} color="light-warning" variant="solid-pastel" size="xs" />}
          </div>
        </div>

        {/* 우측 패널 */}
        <aside className="no-print border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] overflow-y-auto">
          {selNode ? (
            <NodePanel node={selNode} edges={edges} nodes={nodes} onPatch={(fn) => patchNode(selNode.id, fn)} onPatchEdge={patchEdge} readOnly={isGenerating} />
          ) : (
            <div className="p-[20rem] space-y-[16rem]">
              <div className="rounded-xl bg-[var(--color-surface-brand-subtle)] p-[16rem] typo-body-sm leading-relaxed text-[var(--color-text-secondary)]">
                <div className="font-medium flex items-center gap-[6rem] mb-[4rem] text-[var(--color-text-brand)]"><IconInfo size={16} /> 편집 안내 (S07·S08)</div>
                기본 순차 Flow는 선택한 조치 순서대로 자동 구성되었습니다. 노드를 클릭하면 상세(담당·세부행동·전파·자원)를 확인·수정할 수 있고, <b className="text-[var(--color-text-primary)] font-medium">상황판단</b> 노드를 추가해 분기값과 분기별 연결대상을 직접 설정한 뒤 실행본으로 확정합니다.
              </div>
              <div>
                <div className="label mb-[8rem] flex items-center gap-[4rem]"><IconClock size={12} /> 버전 이력</div>
                <div className="space-y-[6rem]">
                  {[...s.sopVersions].reverse().map((v) => (
                    <button key={v.id} onClick={() => st.setActiveSop(s.id, v.id)} className={cn("w-full text-left rounded-xl border p-[10rem] transition", v.id === active.id ? "border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)]" : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]")}>
                      <div className="flex items-center gap-[8rem]">
                        <span className="typo-body-sm font-medium text-[var(--color-text-primary)]">v{v.version}</span>
                        <span className="typo-body-sm text-[var(--color-text-basic)]">{v.label}</span>
                        <DsBadge className="ml-auto" label={v.kind === "confirmed" ? "실행본" : v.kind === "edited" ? "수정본" : "추천"} color={v.kind === "confirmed" ? "success" : v.kind === "edited" ? "light-warning" : "primary"} variant="solid-pastel" size="xs" />
                      </div>
                      <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">{fmtDateTime(v.createdAt)} · {v.createdBy} · 노드 {v.nodes.length}{v.note ? ` · ${v.note}` : ""}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="typo-body-sm text-[var(--color-text-helper)] leading-relaxed">단축키: 노드/연결 선택 후 Delete 삭제 · 노드 하단 핸들을 드래그해 연결 · 상황판단 노드는 우측 핸들로 분기 연결</div>
            </div>
          )}
        </aside>
      </div>

      {aiModal}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="SOP 실행본 확정"
        description={`추천 원본과 사용자 확정본을 분리 보관하고 실행용 SOP 버전(v${s.sopVersions.length + 1})을 생성합니다.`}
        intent="success"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => { st.confirmSop(s.id, confirmNote || undefined); setConfirmOpen(false); toast.success("실행본으로 확정했습니다"); onNext(); }}>
              확정하고 실행으로
            </Button>
          </>
        }
      >
        <div className="typo-body-md text-[var(--color-text-secondary)]">노드 {nodes.length}개 · 연결 {edges.length}개 · 상황판단 {decisionCount}개</div>
        {decisionCount > 0 && edges.filter((e) => nodes.find((n) => n.id === e.source)?.data.kind === "decision" && !e.label).length > 0 && (
          <div className="mt-[12rem] rounded-lg bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)] p-[12rem] typo-body-sm">분기값이 지정되지 않은 상황판단 연결이 있습니다. 실행 시 첫 연결로 진행됩니다.</div>
        )}
        <div className="mt-[12rem]">
          <TextInput label="확정 메모(선택)" value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} placeholder="예) 상황판단회의 결과 반영" />
        </div>
      </Modal>
    </div>
  );
}

function IconFlow2() {
  return <IconPlay size={28} />;
}

// ── 노드 상세 패널 ───────────────────────────────────────────────────────────
function NodePanel({ node, nodes, edges, onPatch, onPatchEdge, readOnly }: { node: SopNode; nodes: SopNode[]; edges: SopEdge[]; onPatch: (fn: (n: SopNode) => SopNode) => void; onPatchEdge: (id: string, patch: Partial<SopEdge>) => void; readOnly: boolean }) {
  const d = node.data;
  const outs = edges.filter((e) => e.source === node.id);
  const setData = (patch: Partial<SopNode["data"]>) => onPatch((n) => ({ ...n, data: { ...n.data, ...patch } }));
  const [newBranch, setNewBranch] = useState("");
  const terminal = d.kind === "start" || d.kind === "end";
  const tone = d.kind === "decision" ? "amber" : d.kind === "spread" ? "purple" : d.kind === "resource" ? "green" : "blue";

  return (
    <div className="p-[20rem] space-y-[16rem]">
      <div className="flex items-center gap-[8rem]">
        <Badge tone={tone}>{KIND_LABEL[d.kind]}</Badge>
        <span className="typo-body-sm text-[var(--color-text-helper)] font-mono">#{node.id}</span>
      </div>
      <TextInput label="노드 제목" value={d.title} disabled={readOnly} onChange={(e) => setData({ title: e.target.value })} />
      {!terminal && d.kind !== "decision" && (
        <>
          <TextInput label="담당부서" value={d.leadDept ?? ""} disabled={readOnly} onChange={(e) => setData({ leadDept: e.target.value })} placeholder="주관부서" />
          <TextInput label="지원부서" value={d.supportDept ?? ""} disabled={readOnly} onChange={(e) => setData({ supportDept: e.target.value })} />
          <TextInput label="협업기관" value={d.coopAgencies ?? ""} disabled={readOnly} onChange={(e) => setData({ coopAgencies: e.target.value })} />
          <TextArea label="세부행동 (줄바꿈 구분)" size="sm" minHeight={110} disabled={readOnly} value={(d.details ?? []).join("\n")} onChange={(e) => setData({ details: e.target.value.split("\n").filter(Boolean) })} />
          <TextInput label="전파대상 (쉼표 구분)" disabled={readOnly} value={(d.targets ?? []).join(", ")} onChange={(e) => setData({ targets: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          <TextInput label="필요자원 (쉼표 구분)" disabled={readOnly} value={(d.resources ?? []).join(", ")} onChange={(e) => setData({ resources: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
          <div>
            <div className="label mb-[6rem] flex items-center justify-between">
              하위 임무 ({d.subMissions.length})
              {!readOnly && (
                <Button size="xs" variant="ghost" leftIcon={<IconPlus size={12} />} onClick={() => setData({ subMissions: [...d.subMissions, { id: Date.now(), title: "새 임무", type: "common", dffTyCode: "000000", detail: "", spreadContent: "", note: "", manager: [], recipient: [] } as SubMission] })}>
                  추가
                </Button>
              )}
            </div>
            <div className="space-y-[8rem]">
              {d.subMissions.map((m) => (
                <div key={m.id} className={cn("rounded-xl border p-[10rem] space-y-[6rem]", m.type === "spread" ? "border-[var(--purple-75)] bg-[var(--purple-20)]" : "border-[var(--color-border-subtle)]")}>
                  <div className="flex items-center gap-[8rem]">
                    <Badge tone={m.type === "spread" ? "purple" : "gray"}>{m.type === "spread" ? "전파" : "임무"}</Badge>
                    <div className="flex-1">
                      <TextInput size="xs" disabled={readOnly} value={m.title} onChange={(e) => setData({ subMissions: d.subMissions.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)) })} />
                    </div>
                    {!readOnly && <IconButton icon={<IconTrash size={12} />} variant="ghost" color="grayscale" size="3xs" aria-label="삭제" onClick={() => setData({ subMissions: d.subMissions.filter((x) => x.id !== m.id) })} />}
                  </div>
                  <TextArea size="sm" minHeight={56} disabled={readOnly} value={m.type === "spread" ? m.spreadContent : m.detail} onChange={(e) => setData({ subMissions: d.subMissions.map((x) => (x.id === m.id ? (m.type === "spread" ? { ...x, spreadContent: e.target.value } : { ...x, detail: e.target.value }) : x)) })} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {d.kind === "decision" && (
        <>
          <div className="rounded-xl bg-[var(--yellow-20)] border border-[var(--yellow-75)] p-[12rem] typo-body-sm leading-relaxed text-[var(--yellow-700)]">상황판단 노드입니다. 분기값을 정의하고 각 연결선에 분기값을 지정하세요. 실행 시 사용자가 선택한 분기값의 연결대상으로 진행합니다 (UFR-004-008 / UFR-005-010).</div>
          <TextArea label="분기조건 설명" size="sm" minHeight={60} disabled={readOnly} value={(d.details ?? []).join("\n")} onChange={(e) => setData({ details: e.target.value.split("\n").filter(Boolean) })} placeholder="예) 호우경보 발효 여부 / 인명피해 우려지역 침수 여부" />
          <div>
            <div className="label mb-[6rem]">분기값</div>
            <div className="flex flex-wrap gap-[6rem]">
              {(d.branches ?? []).map((b) => (
                <span key={b} className="inline-flex items-center gap-[4rem] bg-[var(--color-surface-primary)] border border-[var(--yellow-75)] rounded-sm px-[8rem] h-[24rem] typo-body-sm font-medium">
                  {b}
                  {!readOnly && <button onClick={() => setData({ branches: (d.branches ?? []).filter((x) => x !== b) })} className="text-[var(--color-icon-tertiary)] hover:text-[var(--color-icon-error)]">×</button>}
                </span>
              ))}
            </div>
            {!readOnly && (
              <div className="flex gap-[6rem] mt-[8rem]">
                <div className="flex-1">
                  <TextInput size="xs" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="분기값 추가 (예: 경보 발효)" onKeyDown={(e) => { if (e.key === "Enter" && newBranch.trim()) { setData({ branches: [...(d.branches ?? []), newBranch.trim()] }); setNewBranch(""); } }} />
                </div>
                <IconButton icon={<IconPlus size={16} />} variant="outline" color="grayscale" size="xs" aria-label="추가" onClick={() => { if (newBranch.trim()) { setData({ branches: [...(d.branches ?? []), newBranch.trim()] }); setNewBranch(""); } }} />
              </div>
            )}
          </div>
          <div>
            <div className="label mb-[6rem]">분기값별 연결대상 ({outs.length})</div>
            {outs.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">하단/우측 핸들을 드래그해 다음 노드와 연결하세요</div>}
            <div className="space-y-[6rem]">
              {outs.map((e) => {
                const t = nodes.find((n) => n.id === e.target);
                return (
                  <div key={e.id} className="flex items-center gap-[8rem] rounded-lg border border-[var(--color-border-subtle)] p-[8rem]">
                    <div className="w-[130rem]">
                      <SelectBox size="xs" disabled={readOnly} value={e.label ?? ""} onChange={(v) => onPatchEdge(e.id, { label: v || undefined })} placeholder="분기값" options={(d.branches ?? []).map((b) => ({ value: b, label: b }))} />
                    </div>
                    <IconArrowRight size={12} className="text-[var(--color-icon-tertiary)]" />
                    <span className="typo-body-sm font-medium truncate flex-1 text-[var(--color-text-primary)]">{t?.data.title ?? e.target}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
      {!terminal && <DsCheckbox size="sm" label="자동 진행(AtmcProgrsYn)" disabled={readOnly} checked={d.autoRun} onCheckedChange={(v) => setData({ autoRun: v })} />}
      {!terminal && d.kind !== "decision" && <div className="typo-body-sm text-[var(--color-text-tertiary)]">다음 노드: {outs.map((e) => nodes.find((n) => n.id === e.target)?.data.title ?? e.target).join(", ") || "-"}</div>}
    </div>
  );
}

// ── AI 생성 모달 (원본 AiGenerateButton UI 이식) ────────────────────────────
function AiModal({ open, onClose, query, setQuery, submitted, status, preview, meta, isGenerating, onGenerate, onStop }: { open: boolean; onClose: () => void; query: string; setQuery: (v: string) => void; submitted: string; status: string | null; preview: CompnSaveParams[]; meta: StreamMeta | null; isGenerating: boolean; onGenerate: (q: string) => void; onStop: () => void }) {
  const examples = useMemo(() => ["부산 호우경보 발효, 온천천 하상도로 침수 시작. 초기대응 SOP 구성", "태풍경보 발효 시 해안가 월파 우려지역 주민 사전대피 절차", "기상특보 해제 이후 재해취약지 사후점검 및 피해복구 절차", "산불 발생 시 국립공원 탐방객 통제 및 진화지원 절차"], []);
  return (
    <Modal open={open} onClose={onClose} title="AI SOP 생성" description="자연어로 상황을 설명하면 UNI RAG(/chat/json)가 SOP 컴포넌트를 생성해 캔버스에 실시간으로 그립니다. 접속이 불가하면 Seed 조치로 로컬 생성됩니다." size="md">
      {meta && <div className="mb-[12rem]"><DsBadge label={meta.source === "uni" ? `UNI · ${meta.model}` : "로컬 대체 생성"} color={meta.source === "uni" ? "success" : "light-warning"} variant="solid-pastel" size="sm" /></div>}
      {submitted && (
        <div className="text-right mb-[12rem]">
          <span className="inline-block bg-[var(--color-interaction-primary-bg-muted-default)] text-[var(--color-text-primary)] px-[14rem] py-[8rem] rounded-[16px_16px_4px_16px] typo-body-md max-w-[90%] text-left">{submitted}</span>
        </div>
      )}
      {isGenerating && preview.length === 0 && (
        <div className="typo-body-md text-[var(--color-text-tertiary)] py-[12rem]"><span className="pulse-soft">{STATUS_LABEL[status ?? ""] ?? status}</span><Dots /></div>
      )}
      {preview.length > 0 && (
        <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)] p-[16rem] mb-[16rem]">
          <div className="typo-body-sm text-[var(--color-text-tertiary)] mb-[8rem] flex items-center gap-[6rem]">✦ {isGenerating ? <span>{STATUS_LABEL[status ?? ""]}<Dots /></span> : `생성 완료 • ${preview.length}단계`}</div>
          <ol className="space-y-[6rem]">
            {preview.map((c, i) => (
              <li key={c.CompnSn} className="flex items-center gap-[8rem] typo-body-md text-[var(--color-text-basic)]">
                <span className="step-dot bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] text-[var(--color-text-tertiary)]">{i + 1}</span>
                <span>{c.CompnSj}</span>
                <span className="typo-body-sm text-[var(--color-text-helper)] ml-auto font-mono">{c.CompnTyCode}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!submitted && (
        <div className="flex flex-wrap gap-[6rem] mb-[12rem]">
          {examples.map((ex) => (
            <button key={ex} className="typo-body-sm px-[10rem] py-[6rem] rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] text-left text-[var(--color-text-secondary)]" onClick={() => setQuery(ex)}>{ex}</button>
          ))}
        </div>
      )}
      <div className="flex gap-[8rem] items-end">
        <div className="flex-1">
          <TextArea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상황을 설명하세요..." disabled={isGenerating} minHeight={72} />
        </div>
        {isGenerating ? (
          <IconButton icon={<IconStop size={20} />} variant="outline" color="grayscale" size="md" aria-label="정지" onClick={onStop} />
        ) : (
          <IconButton icon={<IconArrowUp size={20} />} variant="fill" color="primary" size="md" aria-label="생성" disabled={!query.trim()} onClick={() => { onGenerate(query); setQuery(""); }} />
        )}
      </div>
    </Modal>
  );
}

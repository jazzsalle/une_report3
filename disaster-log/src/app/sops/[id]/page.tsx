"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  SOP 편집기 (라이브러리) — 초안 편집 · 게시 · 게시/배포 이력
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { Badge as DsBadge, ChoiceChip, IconButton } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { Button, Dots, Modal, TextArea, TextInput, useToast } from "@/components/ui";
import { IconAi, IconArrowLeft, IconCheckCircle, IconClock, IconCopy, IconDownload, IconInfo, IconList, IconNodeDecision, IconNodeProcess, IconAnnounce, IconStorage, IconStop, IconTrash, IconPlay, IconEdit } from "@/components/icons";
import { SopCanvas } from "@/components/sop/SopCanvas";
import { SidePanel, SidePanelOpener, useSidePanel } from "@/components/sop/SidePanel";
import { NodePanel, AiModal, STATUS_LABEL, KIND_LABEL } from "@/components/situation/SopTab";
import { ActionPickerModal } from "@/components/sop/ActionPickerModal";
import { streamSopGeneration, type StreamMeta } from "@/lib/ai/stream";
import { toEdges, toNode } from "@/lib/sop/converters";
import { actionsToCompns } from "@/lib/sop/adapter";
import { compnsToFlow } from "@/lib/sop/converters";
import { NODE_SIZE, type CompnSaveParams } from "@/lib/sop/compn";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import type { DisasterType, NodeKind, SopEdge, SopNode } from "@/lib/types";
import { cn, downloadBlob, fmtDateTime, uid } from "@/lib/utils";

const TYPES: DisasterType[] = ["flood", "typhoon", "heavy_snow", "wildfire"];

export default function SopTemplatePage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}

function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const hydrated = useHydrated();
  const st = useAppStore();
  const t = st.templates[id];

  const [selId, setSelId] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [metaOpen, setMetaOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(sp.get("ai") === "1");
  const [side, setSide] = useState<"node" | "history">("node");
  const panel = useSidePanel();

  // AI 생성 상태
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  const [aiMeta, setAiMeta] = useState<StreamMeta | null>(null);
  const [preview, setPreview] = useState<CompnSaveParams[]>([]);
  const compnsRef = useRef<CompnSaveParams[]>([]);
  const actionsRef = useRef<Record<number, unknown>>({});
  const abortRef = useRef<AbortController | null>(null);
  const isGenerating = llmStatus !== null && llmStatus !== "end";

  const nodes = useMemo(() => t?.draft.nodes ?? [], [t]);
  const edges = useMemo(() => t?.draft.edges ?? [], [t]);
  const selNode = nodes.find((n) => n.id === selId);
  const dirty = !!t && (!t.published || t.updatedAt > t.published.publishedAt);

  const onCanvasChange = useCallback((n: SopNode[], e: SopEdge[]) => { if (!isGenerating && t) st.updateTemplateDraft(t.id, n, e); }, [isGenerating, t, st]);
  const patchNode = (nid: string, fn: (n: SopNode) => SopNode) => t && st.updateTemplateDraft(t.id, nodes.map((n) => (n.id === nid ? fn(n) : n)), edges);
  const patchEdge = (eid: string, patch: Partial<SopEdge>) => t && st.updateTemplateDraft(t.id, nodes, edges.map((e) => (e.id === eid ? { ...e, ...patch } : e)));

  const addNode = (kind: NodeKind) => {
    if (!t) return;
    const maxY = nodes.reduce((m, n) => Math.max(m, n.position.y), 0);
    const anchor = selNode ?? nodes.find((n) => n.data.kind === "end") ?? nodes[nodes.length - 1];
    const nid = uid("n");
    const size = NODE_SIZE[kind];
    const node: SopNode = { id: nid, type: "sop", position: { x: (anchor?.position.x ?? 120) + (selNode ? 320 : 0), y: selNode ? selNode.position.y : maxY + 150 }, width: size.w, height: size.h, data: { kind, title: kind === "decision" ? "상황판단: 조건 입력" : kind === "spread" ? "상황전파" : kind === "resource" ? "자원 투입" : "새 프로세스", autoRun: false, subMissions: [], branches: kind === "decision" ? ["예", "아니오"] : undefined, ui: {} } };
    let ne = edges;
    if (selNode && selNode.data.kind !== "end") ne = [...edges, { id: `xy-edge__${selNode.id}${selNode.data.kind === "decision" ? "right" : "bottom"}-${nid}top`, source: selNode.id, target: nid, sourceHandle: selNode.data.kind === "decision" ? "right" : "bottom", targetHandle: "top", label: selNode.data.kind === "decision" ? selNode.data.branches?.[1] : undefined }];
    st.updateTemplateDraft(t.id, [...nodes, node], ne);
    setSelId(nid);
  };
  const deleteSelected = () => {
    if (!t) return;
    if (selId) {
      if (nodes.find((x) => x.id === selId)?.data.kind === "start") return toast.error("시작 노드는 삭제할 수 없습니다");
      st.updateTemplateDraft(t.id, nodes.filter((x) => x.id !== selId), edges.filter((e) => e.source !== selId && e.target !== selId));
      setSelId(null);
    } else if (selEdge) {
      st.updateTemplateDraft(t.id, nodes, edges.filter((e) => e.id !== selEdge));
      setSelEdge(null);
    }
  };

  const handleGenerate = async (q: string) => {
    if (!q.trim() || isGenerating || !t) return;
    setSubmitted(q); setPreview([]); compnsRef.current = []; actionsRef.current = {}; setAiMeta(null); setLlmStatus("searching");
    const ctrl = new AbortController(); abortRef.current = ctrl;
    try {
      await streamSopGeneration(q, { disasterType: t.disasterTypes[0], organization: t.tags[0] ?? "재난안전대책본부" }, {
        onMeta: setAiMeta, onStatus: setLlmStatus, onError: (e) => toast.error(e),
        onCompn: (c, action) => { const compn = c as CompnSaveParams; compnsRef.current = [...compnsRef.current, compn]; if (action) actionsRef.current[compn.CompnSn] = action; setPreview([...compnsRef.current]); },
      }, ctrl.signal);
      setLlmStatus("end");
      if (compnsRef.current.length) {
        const all = compnsRef.current;
        st.updateTemplateDraft(t.id, all.map((c) => toNode(c, actionsRef.current[c.CompnSn] as never)), toEdges(all));
        st.updateTemplateMeta(t.id, { description: t.description || `AI 생성: ${q}` });
        toast.success(`AI 생성 완료 · ${all.length}개 컴포넌트 (초안에 반영)`);
        setFitKey((k) => k + 1);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
      setLlmStatus(null);
    }
  };
  const handleStop = () => { abortRef.current?.abort(); setLlmStatus(null); setPreview([]); compnsRef.current = []; };

  const summary = useMemo(() => ({ work: nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end").length, decisions: nodes.filter((n) => n.data.kind === "decision").length, unlabeled: edges.filter((e) => nodes.find((n) => n.id === e.source)?.data.kind === "decision" && !e.label).length }), [nodes, edges]);

  if (!hydrated) return <div className="p-[32rem] typo-body-md text-[var(--color-text-tertiary)]">불러오는 중…</div>;
  if (!t) return <div className="p-[32rem]"><div className="card p-[32rem] text-center"><div className="typo-body-lg font-medium">SOP 를 찾을 수 없습니다</div><Button className="mt-[16rem]" onClick={() => router.push("/sops")}>라이브러리로</Button></div></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-50px)]">
      {/* 헤더 */}
      <div className="bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] px-[20rem] py-[12rem] flex items-start gap-[12rem] flex-wrap">
        <Link href="/sops" className="size-[36rem] grid place-items-center rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] shrink-0 text-[var(--color-icon-secondary)]"><IconArrowLeft size={16} /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[6rem] flex-wrap">
            {t.status === "published" ? <DsBadge label={`게시 v${t.published?.version}`} color="success" variant="solid" size="xs" /> : <DsBadge label="초안 · 미게시" color="light-warning" variant="solid-pastel" size="xs" />}
            {dirty && t.published && <DsBadge label="게시 후 변경됨" color="grayscale" variant="outline" size="xs" />}
            {t.disasterTypes.map((d) => <DsBadge key={d} label={DISASTER_LABEL[d]} color="primary" variant="outline" size="xs" />)}
            {t.tags.map((g) => <DsBadge key={g} label={g} color="grayscale" variant="solid-pastel" size="xs" />)}
            <span className="typo-body-sm text-[var(--color-text-helper)] font-mono">{t.id}</span>
          </div>
          <div className="flex items-center gap-[8rem] mt-[4rem]">
            <h1 className="typo-title-sm font-bold text-[var(--color-text-primary)] truncate">{t.name}</h1>
            <IconButton icon={<IconEdit size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="정보 편집" onClick={() => setMetaOpen(true)} />
          </div>
          <div className="typo-body-sm text-[var(--color-text-tertiary)]">{t.description ?? "설명 없음"} · 수정 {fmtDateTime(t.updatedAt)} · {t.createdBy}</div>
        </div>
        <div className="flex gap-[8rem] flex-wrap items-center">
          <Button size="sm" variant="outline" leftIcon={<IconDownload size={16} />} onClick={() => downloadBlob(new Blob([JSON.stringify(t, null, 2)], { type: "application/json" }), `${t.name}.sop.json`)}>JSON</Button>
          <Button size="sm" variant="outline" leftIcon={<IconCopy size={16} />} onClick={() => { const nid = st.duplicateTemplate(t.id); if (nid) { toast.success("복제했습니다"); router.push(`/sops/${nid}`); } }}>복제</Button>
          <Button size="sm" variant="ghost" leftIcon={<IconTrash size={16} />} onClick={() => { if (confirm(`"${t.name}" 을 삭제할까요?`)) { st.deleteTemplate(t.id); router.push("/sops"); } }}>삭제</Button>
          <Button size="sm" variant="success" disabled={isGenerating || (!dirty && t.status === "published")} leftIcon={<IconCheckCircle size={16} />} onClick={() => setPublishOpen(true)}>{t.status === "published" ? `v${(t.published?.version ?? 0) + 1} 게시` : "게시(실행 가능)"}</Button>
        </div>
      </div>

      {/* 툴바 */}
      <div className="flex items-center gap-[8rem] px-[20rem] py-[10rem] bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] flex-wrap">
        <span className="typo-body-sm font-medium text-[var(--color-text-tertiary)] mr-[4rem]">노드 추가</span>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconNodeProcess size={16} />} onClick={() => addNode("process")}>프로세스</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconNodeDecision size={16} className="text-[var(--yellow-500)]" />} onClick={() => addNode("decision")}>상황판단</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconAnnounce size={16} className="text-[var(--purple-600)]" />} onClick={() => addNode("spread")}>상황전파</Button>
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconStorage size={16} className="text-[var(--color-icon-success)]" />} onClick={() => addNode("resource")}>자원</Button>
        <Button size="sm" variant="ghost" disabled={isGenerating || (!selId && !selEdge)} leftIcon={<IconTrash size={16} />} onClick={deleteSelected}>삭제</Button>
        <span className="w-px h-[24rem] bg-[var(--color-border-default)] mx-[4rem]" />
        <Button size="sm" variant="outline" disabled={isGenerating} leftIcon={<IconList size={16} />} onClick={() => setPickOpen(true)}>매뉴얼 조치로 구성</Button>
        <Button size="sm" disabled={isGenerating} leftIcon={<IconAi size={16} />} onClick={() => setAiOpen(true)}>AI 생성</Button>
        <div className="ml-auto flex items-center gap-[6rem]">
          <DsBadge label={`조치 ${summary.work}`} color="grayscale" variant="solid-pastel" size="xs" />
          {summary.decisions > 0 && <DsBadge label={`상황판단 ${summary.decisions}`} color="light-warning" variant="solid-pastel" size="xs" />}
          {summary.unlabeled > 0 && <DsBadge label={`분기값 미지정 ${summary.unlabeled}`} color="error" variant="solid-pastel" size="xs" />}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="relative min-h-[420px] flex-1 min-w-0">
          <SopCanvas nodes={nodes} edges={edges} readOnly={isGenerating} onChange={onCanvasChange} onSelect={(n, e) => { setSelId(n); setSelEdge(e); if (n) setSide("node"); }} fitKey={fitKey} />
          <SidePanelOpener hidden={panel.hidden} onToggle={() => panel.toggle()} />
          {isGenerating && (
            <div className="absolute left-[16rem] top-[16rem] flex items-center gap-[8rem] bg-[var(--color-surface-primary)] border border-[var(--color-border-subtle)] rounded-xl px-[12rem] py-[8rem] shadow-[var(--elevation-03)]">
              <IconAi size={16} className="text-[var(--color-icon-brand)] pulse-soft" />
              <span className="typo-body-sm font-medium">AI SOP 생성 중 · {STATUS_LABEL[llmStatus ?? ""] ?? llmStatus}<Dots /></span>
              <IconButton icon={<IconStop size={16} />} variant="ghost" color="grayscale" size="3xs" aria-label="정지" onClick={handleStop} />
            </div>
          )}
        </div>
        <SidePanel width={panel.width} onWidth={panel.setWidth} hidden={panel.hidden} onToggle={() => panel.toggle()} header={
          <div className="flex gap-[2rem]">
            {(["node", "history"] as const).map((k) => (
              <button key={k} onClick={() => setSide(k)} className={cn("h-[28rem] px-[10rem] rounded-md typo-body-sm font-medium", side === k ? "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]" : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-subtle)]")}>{k === "node" ? "노드 상세" : "게시·배포 이력"}</button>
            ))}
          </div>
        }>
          {side === "node" ? (
            selNode ? (
              <NodePanel node={selNode} edges={edges} nodes={nodes} onPatch={(fn) => patchNode(selNode.id, fn)} onPatchEdge={patchEdge} readOnly={isGenerating} />
            ) : (
              <div className="p-[20rem] rounded-xl m-[16rem] bg-[var(--color-surface-brand-subtle)] typo-body-sm leading-relaxed text-[var(--color-text-secondary)]">
                <div className="font-medium flex items-center gap-[6rem] mb-[4rem] text-[var(--color-text-brand)]"><IconInfo size={16} /> 라이브러리 편집기</div>
                여기서 편집하는 내용은 <b className="font-medium text-[var(--color-text-primary)]">초안</b>에만 저장됩니다. 「게시」를 누르면 그 시점의 스냅샷이 실행 가능 버전이 되고, 상황에서 선택해 배포·실행할 수 있습니다. 게시 후 다시 편집해도 이미 배포된 상황의 SOP 는 바뀌지 않습니다.
                <div className="mt-[10rem] text-[var(--color-text-tertiary)]">노드 유형: {Object.values(KIND_LABEL).join(" · ")}</div>
              </div>
            )
          ) : (
            <div className="p-[16rem] space-y-[16rem]">
              <div>
                <div className="label mb-[6rem] flex items-center gap-[4rem]"><IconClock size={12} /> 게시 이력</div>
                {t.history.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">아직 게시하지 않았습니다</div>}
                {[...t.history].reverse().map((h) => (
                  <div key={h.version} className="rounded-lg border border-[var(--color-border-subtle)] p-[10rem] mb-[6rem]">
                    <div className="flex items-center gap-[8rem]"><span className="typo-body-sm font-medium">v{h.version}</span><span className="typo-body-sm text-[var(--color-text-tertiary)]">{fmtDateTime(h.publishedAt)} · {h.publishedBy} · 노드 {h.nodeCount}</span></div>
                    {h.note && <div className="typo-body-sm text-[var(--color-text-basic)] mt-[2rem]">{h.note}</div>}
                  </div>
                ))}
              </div>
              <div>
                <div className="label mb-[6rem] flex items-center gap-[4rem]"><IconPlay size={12} /> 상황 배포 이력 ({t.usage.length})</div>
                {t.usage.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">배포된 상황이 없습니다</div>}
                {[...t.usage].reverse().map((u, i) => (
                  <Link key={i} href={`/situations/${u.situationId}?tab=run`} className="block rounded-lg border border-[var(--color-border-subtle)] p-[10rem] mb-[6rem] hover:bg-[var(--color-surface-subtle)]">
                    <div className="typo-body-sm font-medium text-[var(--color-text-primary)] truncate">{u.situationTitle}</div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)]">v{u.version} · {fmtDateTime(u.deployedAt)}</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </SidePanel>
      </div>

      <AiModal open={aiOpen} onClose={() => setAiOpen(false)} query={query} setQuery={setQuery} submitted={submitted} status={llmStatus} preview={preview} meta={aiMeta} isGenerating={isGenerating} onGenerate={handleGenerate} onStop={handleStop} />
      <ActionPickerModal open={pickOpen} onClose={() => setPickOpen(false)} disasterTypes={t.disasterTypes} onBuild={(actions) => { const compns = actionsToCompns(actions, t.tags[0] ?? "재난안전대책본부"); const f = compnsToFlow(compns, actions); st.updateTemplateDraft(t.id, f.nodes, f.edges); setPickOpen(false); setFitKey((k) => k + 1); toast.success(`조치 ${actions.length}건으로 기본 Flow 를 구성했습니다`); }} />

      <Modal open={metaOpen} onClose={() => setMetaOpen(false)} title="SOP 정보" size="md" footer={<Button onClick={() => setMetaOpen(false)}>닫기</Button>}>
        <div className="space-y-[12rem]">
          <TextInput label="이름" value={t.name} onChange={(e) => st.updateTemplateMeta(t.id, { name: e.target.value })} />
          <TextArea label="설명" value={t.description ?? ""} onChange={(e) => st.updateTemplateMeta(t.id, { description: e.target.value })} minHeight={60} />
          <div>
            <div className="label mb-[6rem]">재난유형</div>
            <div className="flex gap-[6rem] flex-wrap">{TYPES.map((d) => <ChoiceChip key={d} label={DISASTER_LABEL[d]} size="sm" variant="outline" selected={t.disasterTypes.includes(d)} onClick={() => st.updateTemplateMeta(t.id, { disasterTypes: t.disasterTypes.includes(d) ? t.disasterTypes.filter((x) => x !== d) : [...t.disasterTypes, d] })} />)}</div>
          </div>
          <TextInput label="태그 (쉼표 구분)" value={t.tags.join(", ")} onChange={(e) => st.updateTemplateMeta(t.id, { tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="부산광역시, 초기대응" />
        </div>
      </Modal>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title={`SOP 게시 v${(t.published?.version ?? 0) + 1}`} description="현재 초안을 실행 가능 버전으로 확정합니다. 상황 화면의 라이브러리 선택 목록에 나타납니다." intent="success" size="sm"
        footer={<><Button variant="ghost" onClick={() => setPublishOpen(false)}>취소</Button><Button variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => { st.publishTemplate(t.id, publishNote || undefined); setPublishOpen(false); setPublishNote(""); toast.success("게시했습니다 — 상황에서 선택해 실행할 수 있습니다"); }}>게시</Button></>}>
        <div className="typo-body-md text-[var(--color-text-secondary)]">조치 {summary.work}개 · 상황판단 {summary.decisions}개</div>
        {summary.unlabeled > 0 && <div className="mt-[8rem] rounded-lg bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)] p-[10rem] typo-body-sm">분기값이 지정되지 않은 상황판단 연결 {summary.unlabeled}건 — 실행 시 첫 연결로 진행됩니다.</div>}
        <div className="mt-[12rem]"><TextInput label="게시 메모(선택)" value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="예) 2026년 우기 대비 개정" /></div>
      </Modal>
    </div>
  );
}

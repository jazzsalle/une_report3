// ─────────────────────────────────────────────────────────────────────────────
//  변환 체인 (원본 AiGenerateButton.tsx 의 toLLMCompn / toNode / toEdges 이식)
//  CompnSaveParams(PascalCase) → SopNode / SopEdge (ReactFlow)
// ─────────────────────────────────────────────────────────────────────────────
import type { RecommendedAction, SopEdge, SopNode, SubMission } from "@/lib/types";
import { CODE_TO_KIND, DFF_TY_COMMON, type CompnSaveParams } from "./compn";

export function toNode(c: CompnSaveParams, action?: RecommendedAction): SopNode {
  const kind = CODE_TO_KIND[c.CompnTyCode] ?? "process";
  const subMissions: SubMission[] = (c.CompnAttrbSaveParamsList ?? []).map((a) => ({
    id: a.AttrbSn,
    title: a.AttrbSj ?? "",
    type: a.DffTyCode === DFF_TY_COMMON ? "common" : "spread",
    dffTyCode: a.DffTyCode,
    detail: a.DffTyCode === DFF_TY_COMMON ? (a.AttrbCn ?? "") : "",
    spreadContent: a.DffTyCode !== DFF_TY_COMMON ? (a.AttrbCn ?? "") : "",
    note: a.AttrbRm ?? "",
    manager: [],
    recipient: [],
  }));
  return {
    id: String(c.CompnSn),
    type: "sop",
    position: { x: c.CompnCrdnt.X, y: c.CompnCrdnt.Y },
    width: c.Width,
    height: c.Hg,
    data: {
      kind,
      title: c.CompnSj,
      autoRun: c.AtmcProgrsYn === "Y",
      leadDept: action?.leadDept,
      supportDept: action?.supportDept,
      coopAgencies: action?.coopAgencies,
      details: action?.details,
      targets: action?.targets,
      resources: action?.resources,
      subMissions,
      branches: kind === "decision" ? ["예", "아니오"] : undefined,
      ui: { color: c.Color, fontSize: c.FontSize, charstSort: c.CharstSort },
      actionId: action?.id,
    },
  };
}

export function toEdges(compns: CompnSaveParams[]): SopEdge[] {
  const snSet = new Set(compns.map((c) => c.CompnSn));
  const edges: SopEdge[] = [];
  for (const c of compns) {
    for (const e of c.EndCompns ?? []) {
      if (!snSet.has(e.CompnSn)) continue; // 존재하는 노드만 연결
      edges.push({
        id: `xy-edge__${c.CompnSn}${e.BeginArrwDrc}-${e.CompnSn}${e.EndArrwDrc}`,
        source: String(c.CompnSn),
        sourceHandle: e.BeginArrwDrc,
        target: String(e.CompnSn),
        targetHandle: e.EndArrwDrc,
        label: e.ArrwCn ?? undefined,
        type: CODE_TO_KIND[c.CompnTyCode] === "decision" ? "label" : undefined,
      });
    }
  }
  return edges;
}

export function compnsToFlow(compns: CompnSaveParams[], actions: RecommendedAction[]) {
  // 시작(1) 다음부터 조치 순서와 1:1 대응
  const nodes = compns.map((c, i) => {
    const action = i >= 1 && i <= actions.length ? actions[i - 1] : undefined;
    return toNode(c, action);
  });
  return { nodes, edges: toEdges(compns) };
}

/** 실행 순서: 시작 노드부터 엣지를 따라 위상 정렬 (분기는 첫 엣지 기준 미리보기) */
export function orderedNodeIds(nodes: SopNode[], edges: SopEdge[]): string[] {
  const start = nodes.find((n) => n.data.kind === "start") ?? nodes[0];
  if (!start) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target));
  }
  nodes.forEach((n) => {
    if (!seen.has(n.id)) out.push(n.id);
  });
  return out;
}

/** 특정 노드의 다음 노드(들) */
export function nextNodes(nodeId: string, edges: SopEdge[], branchValue?: string): string[] {
  const outs = edges.filter((e) => e.source === nodeId);
  if (branchValue) {
    const matched = outs.filter((e) => (e.label ?? "").trim() === branchValue.trim());
    if (matched.length) return matched.map((e) => e.target);
  }
  return outs.map((e) => e.target);
}

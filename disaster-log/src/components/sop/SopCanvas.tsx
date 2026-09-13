"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type OnSelectionChangeParams,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import type { SopEdge, SopNode } from "@/lib/types";
import { SopNodeView, type RFNode } from "./SopNodeView";
import { SopEdgeView, type EdgeStatus } from "./SopEdgeView";

export interface SopCanvasProps {
  nodes: SopNode[];
  edges: SopEdge[];
  runStatus?: Record<string, { status: string }>;
  currentNodeId?: string;
  readOnly?: boolean;
  onChange?: (nodes: SopNode[], edges: SopEdge[]) => void;
  onSelect?: (nodeId: string | null, edgeId: string | null) => void;
  fitKey?: number;
  /** 실행 화면: 이 노드를 화면 중앙(약간 위)에 두고 확대해서 보여준다. 값이 바뀌면 부드럽게 이동 */
  focusNodeId?: string;
  /** focus 시 확대 배율 (기본 1.25 — 한 화면에 2~3개 노드) */
  focusZoom?: number;
}

const nodeTypes = { sop: SopNodeView };
const edgeTypes = { sop: SopEdgeView };

function toRF(nodes: SopNode[], runStatus?: SopCanvasProps["runStatus"], current?: string, prev?: RFNode[]): RFNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "sop" as const,
    position: n.position,
    selected: prev?.find((p) => p.id === n.id)?.selected,
    data: { ...n.data, runStatus: runStatus?.[n.id]?.status as RFNode["data"]["runStatus"], isCurrent: current === n.id },
  }));
}

function edgeStatus(e: SopEdge, runStatus?: SopCanvasProps["runStatus"]): EdgeStatus {
  const s = runStatus?.[e.source]?.status;
  const t = runStatus?.[e.target]?.status;
  if ((s === "done" || s === "skipped") && t === "running") return "active";
  if ((s === "done" || s === "skipped") && (t === "done" || t === "skipped")) return "done";
  return "pending";
}

function toRFEdges(edges: SopEdge[], runStatus?: SopCanvasProps["runStatus"], prev?: Edge[]): Edge[] {
  return edges.map((e) => {
    const status = edgeStatus(e, runStatus);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "bottom",
      targetHandle: e.targetHandle ?? "top",
      selected: prev?.find((p) => p.id === e.id)?.selected,
      type: "sop",
      data: { status, label: e.label },
      markerEnd: { type: MarkerType.ArrowClosed, width: status === "pending" ? 16 : 20, height: status === "pending" ? 16 : 20, color: status === "pending" ? "#94a3b8" : status === "active" ? "#16a34a" : "#198754" },
    };
  });
}

function fromRF(nodes: RFNode[], edges: Edge[]): { nodes: SopNode[]; edges: SopEdge[] } {
  return {
    nodes: nodes.map((n) => {
      const { runStatus: _r, isCurrent: _c, locked: _l, ...data } = n.data;
      void _r;
      void _c;
      void _l;
      return { id: n.id, type: "sop", position: n.position, data };
    }),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: (e.data as { label?: string } | undefined)?.label ?? (typeof e.label === "string" ? e.label : undefined) })),
  };
}

export function SopCanvas({ nodes, edges, runStatus, currentNodeId, readOnly, onChange, onSelect, fitKey, focusNodeId, focusZoom = 1.25 }: SopCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>(toRF(nodes, runStatus, currentNodeId));
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(edges, runStatus));
  const { fitView, setCenter } = useReactFlow();
  const syncing = useRef(false);
  const dirty = useRef(false);

  // 외부 상태 → 캔버스 동기화 (선택 상태 유지)
  useEffect(() => {
    syncing.current = true;
    setRfNodes((prev) => toRF(nodes, runStatus, currentNodeId, prev));
    setRfEdges((prev) => toRFEdges(edges, runStatus, prev));
    const t = setTimeout(() => (syncing.current = false), 0);
    return () => clearTimeout(t);
  }, [nodes, edges, runStatus, currentNodeId, setRfNodes, setRfEdges]);

  // 사용자 변경 → 외부 emit
  useEffect(() => {
    if (!dirty.current || syncing.current || readOnly || !onChange) return;
    dirty.current = false;
    const { nodes: n2, edges: e2 } = fromRF(rfNodes, rfEdges);
    onChange(n2, e2);
  }, [rfNodes, rfEdges, readOnly, onChange]);

  useEffect(() => {
    if (focusNodeId) return; // focus 모드에서는 전체 맞춤 대신 노드 중심 이동
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 300, maxZoom: 1 }), 60);
    return () => clearTimeout(t);
  }, [fitKey, fitView, nodes.length, focusNodeId]);

  // focus 노드 기준 확대·중앙 이동 — 시작 시 시작 노드, 조치 완료 시 다음 노드로 자동 이동
  useEffect(() => {
    if (!focusNodeId) return;
    const n = nodes.find((x) => x.id === focusNodeId);
    if (!n) return;
    const w = n.width ?? (n.data.kind === "start" || n.data.kind === "end" ? 160 : n.data.kind === "decision" ? 220 : 260);
    const h = n.height ?? 96;
    // 노드를 중앙보다 약간 위에 두어 다음 노드가 아래에 보이도록
    const t = setTimeout(() => setCenter(n.position.x + w / 2, n.position.y + h / 2 + 110, { zoom: focusZoom, duration: 600 }), 80);
    return () => clearTimeout(t);
  }, [focusNodeId, focusZoom, nodes, setCenter]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      if (changes.some((c) => c.type === "remove" || (c.type === "position" && c.dragging === false))) dirty.current = true;
      onNodesChange(changes);
    },
    [onNodesChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((c) => c.type === "remove")) dirty.current = true;
      onEdgesChange(changes);
    },
    [onEdgesChange],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly) return;
      dirty.current = true;
      setRfEdges((es) => addEdge({ ...c, id: `xy-edge__${c.source}${c.sourceHandle ?? ""}-${c.target}${c.targetHandle ?? ""}`, type: "sop", data: { status: "pending" }, markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#94a3b8" } }, es));
    },
    [readOnly, setRfEdges],
  );

  const onSelectionChange = useCallback(
    (p: OnSelectionChangeParams) => {
      onSelect?.(p.nodes[0]?.id ?? null, p.edges[0]?.id ?? null);
    },
    [onSelect],
  );

  const mmColor = useMemo(() => (n: RFNode) => ({ start: "#6b7280", end: "#6b7280", process: "#2f6feb", decision: "#b7791f", spread: "#7057d7", resource: "#198754" })[n.data.kind], []);

  return (
    <ReactFlow<RFNode, Edge>
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={onConnect}
      onSelectionChange={onSelectionChange}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      fitView={!focusNodeId}
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} color="#dfe4ea" />
      <Controls showInteractive={false} />
      {!focusNodeId && <MiniMap nodeColor={mmColor} maskColor="rgba(244,246,250,.7)" pannable zoomable />}
    </ReactFlow>
  );
}

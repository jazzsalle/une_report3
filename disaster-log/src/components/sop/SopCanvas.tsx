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

export interface SopCanvasProps {
  nodes: SopNode[];
  edges: SopEdge[];
  runStatus?: Record<string, { status: string }>;
  currentNodeId?: string;
  readOnly?: boolean;
  onChange?: (nodes: SopNode[], edges: SopEdge[]) => void;
  onSelect?: (nodeId: string | null, edgeId: string | null) => void;
  fitKey?: number;
}

const nodeTypes = { sop: SopNodeView };

function toRF(nodes: SopNode[], runStatus?: SopCanvasProps["runStatus"], current?: string, prev?: RFNode[]): RFNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: "sop" as const,
    position: n.position,
    selected: prev?.find((p) => p.id === n.id)?.selected,
    data: { ...n.data, runStatus: runStatus?.[n.id]?.status as RFNode["data"]["runStatus"], isCurrent: current === n.id },
  }));
}

function toRFEdges(edges: SopEdge[], runStatus?: SopCanvasProps["runStatus"], prev?: Edge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "bottom",
    targetHandle: e.targetHandle ?? "top",
    label: e.label,
    selected: prev?.find((p) => p.id === e.id)?.selected,
    type: "smoothstep",
    animated: runStatus?.[e.source]?.status === "done" && runStatus?.[e.target]?.status === "running",
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: runStatus?.[e.source]?.status === "done" ? "#198754" : "#94a3b8" },
    labelStyle: { fontSize: 11, fontWeight: 800, fill: "#7c5a00" },
    labelBgStyle: { fill: "#fff8e5", stroke: "#e0c77f" },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 6,
    style: { stroke: runStatus?.[e.source]?.status === "done" ? "#198754" : "#94a3b8", strokeWidth: 1.8 },
  }));
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
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, label: typeof e.label === "string" ? e.label : undefined })),
  };
}

export function SopCanvas({ nodes, edges, runStatus, currentNodeId, readOnly, onChange, onSelect, fitKey }: SopCanvasProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>(toRF(nodes, runStatus, currentNodeId));
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(toRFEdges(edges, runStatus));
  const { fitView } = useReactFlow();
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
    const t = setTimeout(() => fitView({ padding: 0.2, duration: 300, maxZoom: 1 }), 60);
    return () => clearTimeout(t);
  }, [fitKey, fitView, nodes.length]);

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
      setRfEdges((es) => addEdge({ ...c, id: `xy-edge__${c.source}${c.sourceHandle ?? ""}-${c.target}${c.targetHandle ?? ""}`, type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }, es));
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
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      onConnect={onConnect}
      onSelectionChange={onSelectionChange}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      fitView
      minZoom={0.2}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} color="#dfe4ea" />
      <Controls showInteractive={false} />
      <MiniMap nodeColor={mmColor} maskColor="rgba(244,246,250,.7)" pannable zoomable />
    </ReactFlow>
  );
}

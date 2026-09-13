"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  SOP 연결선 — 실행 상태별 두께·색 + 진행 중 연결선에 흐르는 점(dot) 애니메이션
//   · pending : 회색 2.4px
//   · done    : 초록 3px (완료 → 완료)
//   · active  : 초록 3.5px + 대시 흐름 + 빛 번짐 + 이동하는 점 2개 (완료 → 진행 중)
// ─────────────────────────────────────────────────────────────────────────────
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps, type Edge } from "@xyflow/react";

export type EdgeStatus = "pending" | "done" | "active";
export type SopEdgeData = { status?: EdgeStatus; label?: string };
export type RFEdge = Edge<SopEdgeData, "sop">;

const COLOR: Record<EdgeStatus, string> = { pending: "#94a3b8", done: "#198754", active: "#16a34a" };
const WIDTH: Record<EdgeStatus, number> = { pending: 2.4, done: 3, active: 3.5 };

function SopEdgeViewInner({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd }: EdgeProps<RFEdge>) {
  const status: EdgeStatus = data?.status ?? "pending";
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const color = selected ? "#2f6feb" : COLOR[status];
  return (
    <>
      {status === "active" && <path d={path} fill="none" stroke={color} strokeWidth={WIDTH.active + 8} strokeOpacity={0.18} strokeLinecap="round" className="sop-edge-glow" />}
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: WIDTH[status], strokeLinecap: "round" }} className={status === "active" ? "sop-edge-active" : status === "done" ? "sop-edge-done" : "sop-edge-pending"} />
      {status === "active" && (
        <>
          <circle r={5} fill="#fff" stroke={color} strokeWidth={3} className="sop-edge-dot">
            <animateMotion dur="1.4s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={3.5} fill={color} className="sop-edge-dot" opacity={0.75}>
            <animateMotion dur="1.4s" begin="0.7s" repeatCount="indefinite" path={path} />
          </circle>
        </>
      )}
      {data?.label && (
        <EdgeLabelRenderer>
          <div style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }} className="nodrag nopan rounded-md border border-[#e0c77f] bg-[#fff8e5] px-[6px] py-[2px] text-[11px] font-extrabold text-[#7c5a00] shadow-[0_1px_2px_rgba(0,0,0,.08)]">
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const SopEdgeView = memo(SopEdgeViewInner);

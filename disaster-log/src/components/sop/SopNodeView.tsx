"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { NodeKind, RunStatus, SopNodeData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { IconNodeProcess, IconNodeDecision, IconNodeStartEnd, IconAnnounce, IconStorage, IconCheckCircle, IconLoading } from "@/components/icons";

export type RFData = SopNodeData & { runStatus?: RunStatus; isCurrent?: boolean; locked?: boolean };
export type RFNode = Node<RFData, "sop">;

/** 노드 유형별 시각 — 디자인시스템 토큰 (brand / light-warning / purple / success / gray) */
const KIND_META: Record<NodeKind, { label: string; icon: React.ReactNode; cls: string; head: string }> = {
  start: { label: "시작", icon: <IconNodeStartEnd size={12} />, cls: "border-[var(--color-border-default)] bg-[var(--color-surface-subtle)]", head: "bg-[var(--color-surface-gray)]" },
  end: { label: "종료", icon: <IconNodeStartEnd size={12} />, cls: "border-[var(--color-border-default)] bg-[var(--color-surface-subtle)]", head: "bg-[var(--color-surface-gray)]" },
  process: { label: "프로세스", icon: <IconNodeProcess size={12} />, cls: "border-[var(--light-blue-100)] bg-[var(--color-surface-primary)]", head: "bg-[var(--color-surface-brand)]" },
  decision: { label: "상황판단", icon: <IconNodeDecision size={12} />, cls: "border-[var(--yellow-75)] bg-[var(--yellow-20)]", head: "bg-[var(--color-surface-light-warning)]" },
  spread: { label: "상황전파", icon: <IconAnnounce size={12} />, cls: "border-[var(--purple-75)] bg-[var(--purple-20)]", head: "bg-[var(--purple-600)]" },
  resource: { label: "자원", icon: <IconStorage size={12} />, cls: "border-[var(--green-75)] bg-[var(--green-20)]", head: "bg-[var(--color-surface-success)]" },
};

function SopNodeViewInner({ data, selected }: NodeProps<RFNode>) {
  const m = KIND_META[data.kind];
  const isTerminal = data.kind === "start" || data.kind === "end";
  const status = data.runStatus;
  return (
    <div
      className={cn(
        "sop-node rounded-xl border-2 shadow-[var(--elevation-01)] transition-all",
        m.cls,
        isTerminal ? "w-[160px]" : data.kind === "decision" ? "w-[220px]" : "w-[260px]",
        selected && "ring-0",
        data.isCurrent && "sop-node-current !border-[var(--color-border-success)]",
        status === "done" && "sop-node-done",
        status === "skipped" && "opacity-55 saturate-50",
      )}
    >
      <Handle type="target" position={Position.Top} id="top" />
      {data.kind === "decision" && <Handle type="target" position={Position.Left} id="left" />}
      <div className={cn("flex items-center gap-[6rem] px-[12rem] py-[6rem] rounded-t-[10px] typo-body-sm font-medium", m.head, data.kind === "decision" ? "text-[var(--color-text-on-warning)]" : "text-white")}>
        {m.icon}
        {m.label}
        {status && (
          <span className="ml-auto inline-flex items-center gap-[4rem]">
            {status === "done" ? <IconCheckCircle size={12} /> : status === "running" ? <IconLoading size={12} className="animate-spin" /> : status === "skipped" ? <span className="typo-body-sm">생략</span> : null}
          </span>
        )}
      </div>
      <div className={cn("px-[12rem] py-[10rem]", isTerminal && "text-center")}>
        <div className={cn("font-medium leading-snug text-[var(--color-text-primary)]", isTerminal ? "typo-body-md" : "text-[12.5px]")}>{data.title}</div>
        {!isTerminal && data.leadDept && <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[4rem] truncate">담당 {data.leadDept}</div>}
        {!isTerminal && data.kind !== "decision" && data.subMissions.length > 0 && (
          <div className="mt-[4rem] flex gap-[4rem] flex-wrap text-[10.5px]">
            <span className="px-[6rem] rounded-xs bg-[var(--color-surface-muted)] text-[var(--color-text-secondary)]">임무 {data.subMissions.filter((x) => x.type === "common").length}</span>
            {data.subMissions.some((x) => x.type === "spread") && <span className="px-[6rem] rounded-xs bg-[var(--purple-25)] text-[var(--purple-600)]">전파</span>}
            {data.resources && data.resources.length > 0 && <span className="px-[6rem] rounded-xs bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]">자원</span>}
          </div>
        )}
        {data.kind === "decision" && (
          <div className="mt-[4rem] flex gap-[4rem] flex-wrap text-[10.5px]">
            {(data.branches ?? []).map((b) => (
              <span key={b} className="px-[6rem] rounded-xs bg-[var(--color-surface-primary)] border border-[var(--yellow-75)] text-[var(--yellow-700)]">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
      {data.kind === "decision" && <Handle type="source" position={Position.Right} id="right" />}
    </div>
  );
}

export const SopNodeView = memo(SopNodeViewInner);

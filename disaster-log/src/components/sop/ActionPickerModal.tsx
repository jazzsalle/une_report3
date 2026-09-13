"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  조치 선택 모달 — Seed 조치(풍수해 113 · 산불 10)에서 골라 기본 순차 SOP 구성 (라이브러리용)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { FilterChip, IconButton, Badge as DsBadge } from "@une-front/react-ui";
import type { DisasterType, RecommendedAction, Stage } from "@/lib/types";
import { Button, CheckBox, Modal, TextInput } from "@/components/ui";
import { IconSearch, IconArrowUp, IconArrowDown, IconClose, IconFlow } from "@/components/icons";
import { FLOOD_ACTIONS } from "@/lib/seed/flood";
import { WILDFIRE_ACTIONS } from "@/lib/seed/wildfire";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = ["징후감지", "초기대응", "비상대응", "수습·복구"];
const STAGE_COLOR: Record<Stage, "primary" | "light-warning" | "error" | "success"> = { 징후감지: "primary", 초기대응: "light-warning", 비상대응: "error", "수습·복구": "success" };

export function ActionPickerModal({ open, onClose, disasterTypes, onBuild }: { open: boolean; onClose: () => void; disasterTypes: DisasterType[]; onBuild: (actions: RecommendedAction[]) => void }) {
  const pool = useMemo(() => (disasterTypes.includes("wildfire") && disasterTypes.length === 1 ? WILDFIRE_ACTIONS : disasterTypes.includes("wildfire") ? [...FLOOD_ACTIONS, ...WILDFIRE_ACTIONS] : FLOOD_ACTIONS), [disasterTypes]);
  const [stage, setStage] = useState<Stage | "all">("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const list = pool.filter((a) => (stage === "all" || a.stage === stage) && (!q || `${a.code} ${a.title} ${a.summary} ${a.leadDept}`.includes(q)));
  const selected = picked.map((id) => pool.find((a) => a.id === id)).filter(Boolean) as RecommendedAction[];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const move = (i: number, d: -1 | 1) => setPicked((p) => { const a = [...p]; const j = i + d; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return a; });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="조치 선택으로 SOP 구성"
      description="매뉴얼 조치 카드를 선택·정렬하면 기본 순차 Flow(시작 → 조치 → 종료)로 구성됩니다. 상황판단·분기는 편집기에서 추가합니다."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button disabled={selected.length === 0} leftIcon={<IconFlow size={16} />} onClick={() => { onBuild(selected); setPicked([]); }}>선택 {selected.length}건으로 구성</Button>
        </>
      }
    >
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-[16rem]">
        <div>
          <div className="flex flex-wrap gap-[6rem] items-center mb-[10rem]">
            <FilterChip label="전체" size="sm" variant="outline" selected={stage === "all"} onClick={() => setStage("all")} />
            {STAGES.map((s) => (
              <FilterChip key={s} label={`${s} ${pool.filter((a) => a.stage === s).length}`} size="sm" variant="outline" selected={stage === s} onClick={() => setStage(s)} />
            ))}
            <div className="ml-auto w-[200rem]">
              <TextInput size="xs" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<IconSearch size={16} />} />
            </div>
          </div>
          <div className="border border-[var(--color-border-subtle)] rounded-xl divide-y divide-[var(--color-border-subtle)] max-h-[48vh] overflow-y-auto relative">
            {list.map((a) => {
              const on = picked.includes(a.id);
              return (
                <div key={a.id} className={cn("flex items-start gap-[10rem] px-[12rem] py-[8rem] cursor-pointer", on && "bg-[var(--color-surface-brand-subtle)]")} onClick={() => toggle(a.id)}>
                  <span className="pt-[2rem]" onClick={(e) => e.stopPropagation()}>
                    <CheckBox size="sm" checked={on} onChange={() => toggle(a.id)} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[6rem] flex-wrap">
                      <DsBadge label={a.stage} color={STAGE_COLOR[a.stage]} variant="solid-pastel" size="xs" />
                      <span className="typo-body-md font-medium text-[var(--color-text-primary)]">{a.title}</span>
                      <span className="ml-auto typo-body-sm text-[var(--color-text-brand)] font-medium">{a.leadDept}</span>
                    </div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{a.summary}</div>
                  </div>
                </div>
              );
            })}
            {list.length === 0 && <div className="p-[24rem] text-center typo-body-sm text-[var(--color-text-tertiary)]">검색 결과 없음</div>}
          </div>
        </div>
        <div>
          <div className="label mb-[6rem]">선택 순서 ({selected.length})</div>
          <ol className="space-y-[6rem] max-h-[52vh] overflow-y-auto pr-[2rem]">
            {selected.map((a, i) => (
              <li key={a.id} className="flex items-center gap-[8rem] rounded-lg border border-[var(--color-border-subtle)] p-[8rem]">
                <span className="step-dot bg-[var(--color-surface-brand)] text-[var(--color-text-on-brand)]">{i + 1}</span>
                <span className="flex-1 typo-body-sm font-medium truncate text-[var(--color-text-primary)]">{a.title}</span>
                <IconButton icon={<IconArrowUp size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={<IconArrowDown size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="아래로" disabled={i === selected.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={<IconClose size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="제외" onClick={() => toggle(a.id)} />
              </li>
            ))}
            {selected.length === 0 && <li className="typo-body-sm text-[var(--color-text-tertiary)] py-[16rem] text-center">좌측에서 조치를 선택하세요</li>}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

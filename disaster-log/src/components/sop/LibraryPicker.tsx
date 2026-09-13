"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  라이브러리 선택 모달 — 게시된 SOP 템플릿을 골라 상황에 배포(실행본 스냅샷) / 바로 실행
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge as DsBadge, Card as DsCard, Checkbox as DsCheckbox } from "@une-front/react-ui";
import type { DisasterType, SopTemplate } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Button, EmptyState, Modal, TextInput } from "@/components/ui";
import { IconFlow, IconPlay, IconSearch, IconCheckCircle } from "@/components/icons";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import { cn, fmtDateTime } from "@/lib/utils";

export function templateSummary(t: SopTemplate) {
  const src = t.published ?? { nodes: t.draft.nodes };
  const work = src.nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end");
  return { steps: work.length, decisions: work.filter((n) => n.data.kind === "decision").length, spreads: work.filter((n) => n.data.kind === "spread").length };
}

export function LibraryPicker({ open, onClose, disasterType, onDeployed, allowStart = true }: { open: boolean; onClose: () => void; disasterType?: DisasterType; onDeployed: (templateId: string, started: boolean) => void; allowStart?: boolean }) {
  const templates = useAppStore((s) => s.templates);
  const order = useAppStore((s) => s.templateOrder);
  const [q, setQ] = useState("");
  const [onlyMatch, setOnlyMatch] = useState(!!disasterType);
  const [publishedOnly, setPublishedOnly] = useState(true);
  const [sel, setSel] = useState<string | null>(null);

  const list = useMemo(
    () =>
      order
        .map((id) => templates[id])
        .filter(Boolean)
        .filter((t) => (!publishedOnly || t.status === "published") && (!onlyMatch || !disasterType || t.disasterTypes.includes(disasterType)) && (!q || `${t.name} ${t.description ?? ""} ${t.tags.join(" ")}`.includes(q))),
    [order, templates, publishedOnly, onlyMatch, disasterType, q],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="SOP 라이브러리에서 선택"
      description="게시된 SOP 를 이 상황에 배포하면 실행본 스냅샷이 만들어지고, 실행 이력은 라이브러리 원본과 분리됩니다."
      size="lg"
      footer={
        <>
          <Link href="/sops" className="mr-auto">
            <Button variant="ghost" leftIcon={<IconFlow size={16} />}>라이브러리 관리</Button>
          </Link>
          <Button variant="ghost" onClick={onClose}>취소</Button>
          <Button variant="outline" disabled={!sel} leftIcon={<IconCheckCircle size={16} />} onClick={() => sel && onDeployed(sel, false)}>배포(실행본 확정)</Button>
          {allowStart && (
            <Button variant="success" disabled={!sel} leftIcon={<IconPlay size={16} />} onClick={() => sel && onDeployed(sel, true)}>배포 후 바로 실행</Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-[12rem] mb-[12rem]">
        <div className="flex-1 min-w-[220rem]">
          <TextInput size="sm" placeholder="이름·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<IconSearch size={16} />} clearable onClear={() => setQ("")} />
        </div>
        {disasterType && <DsCheckbox size="sm" checked={onlyMatch} onCheckedChange={setOnlyMatch} label={`${DISASTER_LABEL[disasterType]} 유형만`} />}
        <DsCheckbox size="sm" checked={publishedOnly} onCheckedChange={setPublishedOnly} label="게시본만" />
      </div>
      {list.length === 0 ? (
        <EmptyState size="sm" icon={<IconFlow size={28} />} title="선택할 수 있는 SOP 가 없습니다" desc="라이브러리에서 SOP 를 만들고 게시하면 여기에 나타납니다. 대시보드의 Seed 버튼으로 기본 SOP 3종을 불러올 수도 있습니다." />
      ) : (
        <div className="grid md:grid-cols-2 gap-[10rem] max-h-[52vh] overflow-y-auto pr-[2rem]">
          {list.map((t) => {
            const sm = templateSummary(t);
            return (
              <DsCard key={t.id} cardStyle="outline" selected={sel === t.id} onClick={() => setSel(t.id)} className="!rounded-xl">
                <DsCard.Body className="!p-[14rem] w-full">
                  <div className="flex items-center gap-[6rem] flex-wrap">
                    {t.status === "published" ? <DsBadge label={`게시 v${t.published?.version}`} color="success" variant="solid-pastel" size="xs" /> : <DsBadge label="초안" color="light-warning" variant="solid-pastel" size="xs" />}
                    {t.disasterTypes.map((d) => <DsBadge key={d} label={DISASTER_LABEL[d]} color="primary" variant="outline" size="xs" />)}
                  </div>
                  <div className="typo-body-md font-medium text-[var(--color-text-primary)] mt-[8rem] leading-snug">{t.name}</div>
                  {t.description && <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem] line-clamp-2">{t.description}</div>}
                  <div className={cn("typo-body-sm text-[var(--color-text-tertiary)] mt-[8rem] flex gap-[10rem] flex-wrap")}>
                    <span>조치 {sm.steps}</span>
                    {sm.decisions > 0 && <span>상황판단 {sm.decisions}</span>}
                    {sm.spreads > 0 && <span>전파 {sm.spreads}</span>}
                    <span className="ml-auto">{t.usage.length}회 사용 · {fmtDateTime(t.updatedAt)}</span>
                  </div>
                </DsCard.Body>
              </DsCard>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

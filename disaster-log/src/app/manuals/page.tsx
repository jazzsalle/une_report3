"use client";

import { useMemo, useState } from "react";
import { SegmentedControl, FilterChip } from "@une-front/react-ui";
import { Badge, Card, PageHeader, TextInput } from "@/components/ui";
import { IconBook, IconSearch, IconChevronDown, IconChevronUp } from "@/components/icons";
import { DOCUMENTS } from "@/lib/seed/documents";
import { FLOOD_ACTIONS } from "@/lib/seed/flood";
import { WILDFIRE_ACTIONS } from "@/lib/seed/wildfire";
import type { Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = ["징후감지", "초기대응", "비상대응", "수습·복구"];
const STAGE_TONE: Record<Stage, "blue" | "amber" | "red" | "green"> = { 징후감지: "blue", 초기대응: "amber", 비상대응: "red", "수습·복구": "green" };

export default function ManualsPage() {
  const [src, setSrc] = useState<"flood" | "wildfire">("flood");
  const [stage, setStage] = useState<Stage | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const pool = src === "flood" ? FLOOD_ACTIONS : WILDFIRE_ACTIONS;
  const list = useMemo(() => pool.filter((a) => (stage === "all" || a.stage === stage) && (!q || `${a.code} ${a.title} ${a.summary} ${a.leadDept} ${a.coopAgencies}`.includes(q))), [pool, stage, q]);

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1300px] mx-auto space-y-[20rem]">
      <PageHeader eyebrow="Seed 데이터" title="매뉴얼 · Seed 조치 카드" desc={`부산광역시 풍수해 현장조치 행동매뉴얼(2026.7)의 행동요령 카드 ${FLOOD_ACTIONS.length}건과 환경부 산불 실무매뉴얼(2024) ${WILDFIRE_ACTIONS.length}건을 T3Q 응답 규격(조치코드·조치명·단계·담당·지원·협업기관·세부행동·전파대상·필요자원)으로 정형화했습니다.`} />

      <div className="grid md:grid-cols-3 gap-[12rem]">
        {DOCUMENTS.slice(0, 6).map((d) => (
          <div key={d.id} className="card p-[16rem] flex gap-[12rem]">
            <div className="size-[40rem] rounded-xl bg-[var(--color-surface-brand-subtle)] text-[var(--color-icon-brand)] grid place-items-center shrink-0">
              <IconBook size={20} />
            </div>
            <div className="min-w-0">
              <div className="typo-body-md font-medium text-[var(--color-text-primary)] truncate" title={d.fileName}>{d.fileName}</div>
              <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">
                {d.organization} · {d.category} · {d.year}
                {d.pages ? ` · ${d.pages}p` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card padded={false}>
        <div className="p-[16rem] flex flex-wrap items-center gap-[10rem] border-b border-[var(--color-border-subtle)]">
          <SegmentedControl value={src} setValue={(v) => { setSrc(typeof v === "function" ? v(src) : v); setStage("all"); }} options={[{ value: "flood", label: `풍수해 (${FLOOD_ACTIONS.length})` }, { value: "wildfire", label: `산불 (${WILDFIRE_ACTIONS.length})` }]} size="sm" fitContent />
          <div className="flex gap-[6rem] flex-wrap">
            <FilterChip label="전체" size="sm" variant="outline" selected={stage === "all"} onClick={() => setStage("all")} />
            {STAGES.map((s) => (
              <FilterChip key={s} label={`${s} ${pool.filter((a) => a.stage === s).length}`} size="sm" variant="outline" selected={stage === s} onClick={() => setStage(s)} />
            ))}
          </div>
          <div className="ml-auto w-[260rem]">
            <TextInput size="sm" placeholder="조치명·부서·코드 검색" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<IconSearch size={16} />} clearable onClear={() => setQ("")} />
          </div>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {list.map((a) => (
            <div key={a.id} className="px-[16rem] py-[12rem] hover:bg-[var(--color-surface-subtle)] cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
              <div className="flex items-center gap-[8rem] flex-wrap">
                <span className="font-mono typo-body-sm text-[var(--color-text-tertiary)] w-[48rem]">{a.code}</span>
                <Badge tone={STAGE_TONE[a.stage]}>{a.stage}</Badge>
                <span className="typo-body-md font-medium text-[var(--color-text-primary)]">{a.title}</span>
                <span className="typo-body-sm text-[var(--color-text-tertiary)]">{a.summary}</span>
                <span className="ml-auto typo-body-sm font-medium text-[var(--color-text-brand)]">{a.leadDept}</span>
                {open === a.id ? <IconChevronUp size={16} className="text-[var(--color-icon-tertiary)]" /> : <IconChevronDown size={16} className="text-[var(--color-icon-tertiary)]" />}
              </div>
              {open === a.id && (
                <div className="mt-[12rem] grid md:grid-cols-3 gap-[12rem] typo-body-sm">
                  <div className="md:col-span-2 rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
                    <div className="label mb-[4rem]">세부행동</div>
                    <ul className="list-disc pl-[16rem] space-y-[2rem] leading-relaxed text-[var(--color-text-basic)]">
                      {a.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-[8rem]">
                    <KV k="주관부서" v={a.leadDept} />
                    <KV k="지원부서" v={a.supportDept || "-"} />
                    <KV k="협업기관" v={a.coopAgencies || "-"} />
                    <KV k="전파대상" v={a.targets.join(", ") || "-"} />
                    <KV k="필요자원" v={a.resources.join(", ") || "-"} />
                    <KV k="출처" v={`매뉴얼 p.${a.page}`} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && <div className="p-[32rem] text-center typo-body-md text-[var(--color-text-tertiary)]">검색 결과가 없습니다</div>}
        </div>
      </Card>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className={cn("")}>
      <div className="label">{k}</div>
      <div className="typo-body-sm text-[var(--color-text-basic)] mt-[2rem]">{v}</div>
    </div>
  );
}

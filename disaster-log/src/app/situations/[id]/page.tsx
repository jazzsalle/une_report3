"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge as DsBadge } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { AlertBadge, Badge, Button, ModeBadge, Tabs, type TabItem } from "@/components/ui";
import { IconChevronLeft, IconList, IconDocsCheck, IconFlow, IconPlay, IconMemo, IconExport } from "@/components/icons";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import { fmtDateTime } from "@/lib/utils";
import { OverviewTab } from "@/components/situation/OverviewTab";
import { DocsActionsTab } from "@/components/situation/DocsActionsTab";
import { SopTab } from "@/components/situation/SopTab";
import { RunTab } from "@/components/situation/RunTab";
import { LogTab } from "@/components/situation/LogTab";
import { ReportTab } from "@/components/situation/ReportTab";

type TabKey = "overview" | "docs" | "sop" | "run" | "log" | "report";

export default function SituationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const hydrated = useHydrated();
  const s = useAppStore((st) => st.situations[id]);
  const [tab, setTab] = useState<TabKey>((sp.get("tab") as TabKey) || "overview");

  const counts = useMemo(() => {
    if (!s) return { docs: 0, actions: 0, nodes: 0, done: 0, total: 0, events: 0 };
    const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
    const runs = Object.values(s.runs);
    return { docs: s.selectedDocIds.length, actions: s.selectedActionIds.length, nodes: active?.nodes.length ?? 0, done: runs.filter((r) => r.status === "done").length, total: active?.nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end").length ?? 0, events: s.ledger.length };
  }, [s]);

  if (!hydrated) return <div className="p-[32rem] typo-body-md text-[var(--color-text-tertiary)]">불러오는 중…</div>;
  if (!s)
    return (
      <div className="p-[32rem]">
        <div className="card p-[32rem] text-center">
          <div className="typo-body-lg font-medium">업무를 찾을 수 없습니다</div>
          <Button className="mt-[16rem]" onClick={() => router.push("/")}>
            대시보드로
          </Button>
        </div>
      </div>
    );

  const hasSop = s.sopVersions.length > 0;
  const items: TabItem<TabKey>[] = [
    { key: "overview", label: s.mode === "training" ? "상황·기상·상황부여" : "상황·기상", icon: <IconList size={20} /> },
    { key: "docs", label: "문서·조치 선택", icon: <IconDocsCheck size={20} />, badge: counts.actions ? { label: String(counts.actions), tone: "blue" } : undefined },
    { key: "sop", label: "SOP 구성·편집", icon: <IconFlow size={20} />, badge: counts.nodes ? { label: String(counts.nodes), tone: "blue" } : undefined },
    { key: "run", label: "실행·조치결과", icon: <IconPlay size={20} />, badge: counts.total ? { label: `${counts.done}/${counts.total}`, tone: counts.done === counts.total ? "green" : "amber" } : undefined, disabled: !hasSop },
    { key: "log", label: "상황일지", icon: <IconMemo size={20} />, badge: { label: String(counts.events), tone: "gray" } },
    { key: "report", label: "결과보고", icon: <IconExport size={20} /> },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100vh-50px)]">
      {/* Header */}
      <div className="no-print bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] px-[20rem] md:px-[28rem] pt-[16rem]">
        <div className="flex items-start gap-[12rem] flex-wrap">
          <Link href="/" className="size-[36rem] grid place-items-center rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] shrink-0 text-[var(--color-icon-secondary)]">
            <IconChevronLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-[6rem] flex-wrap">
              <ModeBadge mode={s.mode} />
              <AlertBadge level={s.alertLevel} />
              <Badge tone="navy">{DISASTER_LABEL[s.disasterType]}</Badge>
              {s.running && <DsBadge label="SOP 실행 중" color="success" variant="dot-accent" size="xs" />}
              <span className="typo-body-sm text-[var(--color-text-helper)] font-mono">{s.id}</span>
            </div>
            <h1 className="typo-title-sm font-bold text-[var(--color-text-primary)] mt-[4rem] truncate">{s.title}</h1>
            <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">
              {s.organization} · 기준시각 {fmtDateTime(s.baseTime)} · {s.regions.map((r) => [r.sigungu, r.dong].filter(Boolean).join(" ")).join(", ") || "지자체 전역"} · 작성 {s.createdBy}
            </div>
          </div>
        </div>
        <Tabs className="mt-[12rem]" value={tab} onChange={setTab} items={items} size="md" />
      </div>

      <div className="flex-1 min-h-0">
        {tab === "overview" && <OverviewTab s={s} onNext={() => setTab("docs")} />}
        {tab === "docs" && <DocsActionsTab s={s} onNext={() => setTab("sop")} />}
        {tab === "sop" && <SopTab s={s} onNext={() => setTab("run")} />}
        {tab === "run" && <RunTab s={s} onNext={() => setTab("log")} />}
        {tab === "log" && <LogTab s={s} onNext={() => setTab("report")} />}
        {tab === "report" && <ReportTab s={s} />}
      </div>
    </div>
  );
}

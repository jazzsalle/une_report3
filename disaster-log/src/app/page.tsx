"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card as DsCard, IconButton } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { AlertBadge, Button, Card, EmptyState, ModeBadge, Stat, useToast } from "@/components/ui";
import { IconAi, IconNew, IconTrash, IconArrowRight, IconMonitoring, IconDocument, IconMessage, IconStorage, IconAnnounce, IconCheckCircle, IconPlay } from "@/components/icons";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import { cn, fmtDateTime, relTime } from "@/lib/utils";
import { createDemoSituation, createDemoTraining } from "@/lib/demo";

const FLOW = [
  ["01", "업무 시작", "실제재난 등록 / 훈련계획·상황부여"],
  ["02", "상황정보 확인", "기상특보 열람 · AI 기상요약"],
  ["03", "관련 문서 조회", "파일명 목록 추천 → 선택"],
  ["04", "조치 전체 수신", "조치목록+상세정보 1회 수신"],
  ["05", "조치 선택·순서", "체크 · 순서 조정"],
  ["06", "SOP 구성·실행", "기본 순차 Flow · 상황판단 편집"],
  ["07", "상황일지", "실행·SMS·자원·결과 자동 누적"],
  ["08", "결과보고", "목차·반영자료 → AI 초안 → 출력"],
];

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<string | null>(null);
  const order = useAppStore((s) => s.order);
  const situations = useAppStore((s) => s.situations);
  const deleteSituation = useAppStore((s) => s.deleteSituation);

  const list = useMemo(() => (hydrated ? order.map((id) => situations[id]).filter(Boolean) : []), [hydrated, order, situations]);
  const totals = useMemo(() => {
    const runs = list.reduce((n, s) => n + Object.values(s.runs).filter((r) => r.status === "done").length, 0);
    const sms = list.reduce((n, s) => n + s.sms.length, 0);
    const events = list.reduce((n, s) => n + s.ledger.length, 0);
    const res = list.reduce((n, s) => n + s.resources.length, 0);
    return { runs, sms, events, res };
  }, [list]);

  const runDemo = async (kind: "actual" | "training") => {
    setBusy(kind);
    try {
      const id = kind === "actual" ? await createDemoSituation() : await createDemoTraining();
      toast.success("Seed 시나리오를 구성했습니다");
      router.push(`/situations/${id}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1400px] mx-auto space-y-[20rem]">
      {/* Hero — 브랜드 subtle 서피스 */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-brand-subtle)] p-[28rem] md:p-[36rem]">
        <div className="absolute -right-[60px] -top-[80px] size-[280px] rounded-max bg-[var(--color-interaction-primary-bg-muted-default)] opacity-70" />
        <div className="absolute right-[120px] -bottom-[120px] size-[240px] rounded-max bg-[var(--color-interaction-primary-bg-muted-default)] opacity-40" />
        <div className="relative max-w-[820rem]">
          <div className="typo-body-sm font-medium text-[var(--color-text-brand)]">재난대응·복구 공통 Core · 시나리오 v0.9</div>
          <h1 className="typo-title-lg font-bold text-[var(--color-text-primary)] mt-[4rem]">재난상황일지 생성도구</h1>
          <p className="typo-body-md text-[var(--color-text-secondary)] mt-[10rem] leading-relaxed">
            실제재난과 안전한국훈련을 하나의 흐름으로 처리합니다. 관련 문서 선택 → 조치 상세 일괄 수신 → 조치 선택·정렬 → 기존 UNE SOP 모듈로 기본 Flow 자동구성 → 실행·조치결과·SMS·자원 기록 → 상황일지 자동 누적 → 결과보고 생성까지 한 화면에서 이어집니다.
          </p>
          <div className="flex flex-wrap gap-[8rem] mt-[20rem]">
            <Link href="/situations/new">
              <Button size="lg" leftIcon={<IconNew size={16} />}>
                새 업무 시작
              </Button>
            </Link>
            <Button size="lg" variant="outline" leftIcon={<IconAi size={16} />} loading={busy === "actual"} onClick={() => runDemo("actual")}>
              부산 풍수해 Seed 불러오기
            </Button>
            <Button size="lg" variant="outline" leftIcon={<IconAi size={16} />} loading={busy === "training"} onClick={() => runDemo("training")}>
              안전한국훈련 Seed 불러오기
            </Button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-[12rem]">
        <Stat label="업무(상황)" value={list.length} sub={`실제 ${list.filter((s) => s.mode === "actual").length} · 훈련 ${list.filter((s) => s.mode === "training").length}`} icon={<IconMonitoring size={20} />} />
        <Stat label="완료된 조치" value={totals.runs} tone="green" icon={<IconCheckCircle size={20} />} />
        <Stat label="SMS 발송" value={totals.sms} tone="purple" icon={<IconMessage size={20} />} />
        <Stat label="투입 자원" value={totals.res} tone="amber" icon={<IconStorage size={20} />} />
        <Stat label="누적 이벤트" value={totals.events} tone="red" icon={<IconDocument size={20} />} />
      </div>

      {/* Flow guide */}
      <Card padded={false} title="업무 흐름 (사용자 관점)" subtitle="업무흐름도 v1.0 · 8단계" divider>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {FLOW.map(([n, t, d], i) => (
            <div key={n} className={cn("p-[16rem] border-[var(--color-border-subtle)]", i % 8 !== 7 && "xl:border-r", i < 4 && "border-b xl:border-b-0", i % 2 === 0 && "border-r md:border-r", i >= 4 && i < 6 && "border-b md:border-b-0")}>
              <div className="typo-body-sm font-medium text-[var(--color-text-brand)]">{n}</div>
              <div className="typo-body-md font-medium text-[var(--color-text-primary)] mt-[4rem]">{t}</div>
              <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[4rem] leading-snug">{d}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* List */}
      <Card title="업무 목록" subtitle="진행 중인 실제재난·안전한국훈련 업무. 클릭하면 이어서 진행합니다.">
        {!hydrated ? (
          <div className="typo-body-md text-[var(--color-text-tertiary)] py-[24rem]">불러오는 중…</div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<IconMonitoring size={28} />}
            title="아직 등록된 업무가 없습니다"
            desc="새 업무를 시작하거나, 부산 풍수해 Seed로 전체 흐름(문서 선택 → SOP → 실행 → 일지 → 보고)이 채워진 예시를 바로 확인할 수 있습니다."
            action={
              <div className="flex gap-[8rem]">
                <Link href="/situations/new">
                  <Button leftIcon={<IconNew size={16} />}>새 업무 시작</Button>
                </Link>
                <Button variant="outline" leftIcon={<IconAi size={16} />} loading={busy === "actual"} onClick={() => runDemo("actual")}>
                  Seed 불러오기
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-[12rem]">
            {list.map((s) => {
              const total = Object.values(s.runs).length;
              const done = Object.values(s.runs).filter((r) => r.status === "done").length;
              return (
                <DsCard key={s.id} cardStyle="outline" onClick={() => router.push(`/situations/${s.id}`)} className="!rounded-xl">
                  <DsCard.Body className="!p-[16rem] w-full">
                    <div className="flex items-center gap-[6rem] flex-wrap">
                      <ModeBadge mode={s.mode} />
                      <AlertBadge level={s.alertLevel} />
                      <span className="typo-body-sm text-[var(--color-text-helper)] ml-auto">{relTime(s.updatedAt)}</span>
                    </div>
                    <div className="mt-[10rem] typo-body-lg font-medium text-[var(--color-text-primary)] leading-snug">{s.title}</div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[4rem]">
                      {s.organization} · {DISASTER_LABEL[s.disasterType]} · 기준 {fmtDateTime(s.baseTime)}
                    </div>
                    <div className="grid grid-cols-4 gap-[8rem] mt-[12rem]">
                      <Mini icon={<IconCheckCircle size={12} />} v={`${done}/${total}`} l="조치" />
                      <Mini icon={<IconMessage size={12} />} v={s.sms.length} l="SMS" />
                      <Mini icon={<IconStorage size={12} />} v={s.resources.length} l="자원" />
                      <Mini icon={<IconDocument size={12} />} v={s.ledger.length} l="이벤트" />
                    </div>
                    <div className="flex items-center justify-between mt-[12rem] pt-[12rem] border-t border-[var(--color-border-subtle)]">
                      <div className="flex items-center gap-[6rem] typo-body-sm text-[var(--color-text-tertiary)]">
                        {s.running ? <IconAnnounce size={14} className="text-[var(--color-icon-success)]" /> : <IconPlay size={14} className="text-[var(--color-icon-muted)]" />}
                        {s.running ? "SOP 실행 중" : s.sopVersions.length ? `SOP v${s.sopVersions.length}` : "SOP 미구성"}
                      </div>
                      <div className="flex items-center gap-[4rem]" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          icon={<IconTrash size={16} />}
                          variant="ghost"
                          color="grayscale"
                          size="xs"
                          aria-label="삭제"
                          onClick={() => {
                            if (confirm(`"${s.title}" 업무를 삭제할까요? 되돌릴 수 없습니다.`)) deleteSituation(s.id);
                          }}
                        />
                        <Button size="xs" variant="outline" rightIcon={<IconArrowRight size={12} />} onClick={() => router.push(`/situations/${s.id}`)}>
                          이어서
                        </Button>
                      </div>
                    </div>
                  </DsCard.Body>
                </DsCard>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Mini({ icon, v, l }: { icon: React.ReactNode; v: React.ReactNode; l: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-subtle)] py-[6rem] text-center">
      <div className="flex items-center justify-center gap-[4rem] typo-body-md font-medium text-[var(--color-text-primary)]">
        <span className="text-[var(--color-icon-tertiary)]">{icon}</span>
        {v}
      </div>
      <div className="typo-body-sm text-[var(--color-text-tertiary)]">{l}</div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { FilterChip, IconButton } from "@une-front/react-ui";
import type { RecommendedAction, Situation, Stage } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Card, CheckBox, Dots, EmptyState, TextInput, useToast } from "@/components/ui";
import { IconDocsCheck, IconDocument, IconList, IconArrowUp, IconArrowDown, IconArrowRight, IconFlow, IconChevronDown, IconChevronUp, IconRefresh, IconClose, IconSearch } from "@/components/icons";
import { mockT3Q } from "@/lib/t3q/adapter";
import { cn } from "@/lib/utils";

const STAGES: Stage[] = ["징후감지", "초기대응", "비상대응", "수습·복구"];
const STAGE_TONE: Record<Stage, "blue" | "amber" | "red" | "green"> = { 징후감지: "blue", 초기대응: "amber", 비상대응: "red", "수습·복구": "green" };

export function DocsActionsTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const st = useAppStore();
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingActs, setLoadingActs] = useState(false);
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const ctx = useMemo(
    () => ({ mode: s.mode, organization: s.organization, disasterType: s.disasterType, regions: s.regions.map((r) => r.sigungu ?? r.sido), currentStatus: s.currentStatus, alertLevel: s.alertLevel, trainingScenario: s.training?.scenario, injections: s.injections.map((i) => i.message) }),
    [s],
  );

  const searchDocs = async () => {
    setLoadingDocs(true);
    const docs = await mockT3Q.searchDocuments(ctx);
    st.setRecommendedDocs(s.id, docs);
    setLoadingDocs(false);
    toast.success(`관련 문서 ${docs.length}건을 조회했습니다`);
  };
  const fetchActions = async () => {
    if (s.selectedDocIds.length === 0) return toast.error("문서를 1건 이상 선택하세요");
    setLoadingActs(true);
    const acts = await mockT3Q.recommendActions(ctx, s.selectedDocIds);
    st.setRecommendedActions(s.id, acts);
    setLoadingActs(false);
    toast.success(`조치 ${acts.length}건 + 상세정보를 일괄 수신했습니다 (T3Q 1회 호출)`);
  };
  const build = () => {
    if (s.selectedActionIds.length === 0) return toast.error("조치를 1건 이상 선택하세요");
    const vid = st.buildSopFromSelection(s.id);
    if (vid) {
      toast.success("기본 순차 SOP Flow를 구성했습니다 (T3Q 재호출 없음)");
      onNext();
    }
  };

  const filtered = s.recommendedActions.filter((a) => (stageFilter === "all" || a.stage === stageFilter) && (!q || `${a.code} ${a.title} ${a.summary} ${a.leadDept}`.includes(q)));
  const selected = s.selectedActionIds.map((id) => s.recommendedActions.find((a) => a.id === id)).filter(Boolean) as RecommendedAction[];

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-[1fr_1.4fr_0.9fr] gap-[20rem]">
      {/* S03/S04 문서 */}
      <Card
        title="관련 문서"
        subtitle="S03 · T3Q가 파일명 목록만 반환합니다 (관련도·설명 비노출)."
        right={
          <Button size="sm" variant={s.recommendedDocs.length ? "outline" : "primary"} loading={loadingDocs} leftIcon={s.recommendedDocs.length ? <IconRefresh size={16} /> : <IconDocsCheck size={16} />} onClick={searchDocs}>
            {s.recommendedDocs.length ? "재조회" : "관련 문서 조회"}
          </Button>
        }
      >
        {loadingDocs && s.recommendedDocs.length === 0 ? (
          <div className="typo-body-md text-[var(--color-text-tertiary)] py-[32rem] text-center">
            상황 Context로 문서 검색 중
            <Dots />
          </div>
        ) : s.recommendedDocs.length === 0 ? (
          <EmptyState size="sm" icon={<IconDocsCheck size={28} />} title="관련 문서를 조회하세요" desc={`${s.organization} · ${s.mode === "actual" ? "재난상황" : "훈련계획·시나리오·상황부여"} Context로 T3Q 문서조회 API 요청 규격을 조립합니다.`} />
        ) : (
          <div className="space-y-[6rem]">
            {s.recommendedDocs.map((d) => {
              const on = s.selectedDocIds.includes(d.id);
              return (
                <div key={d.id} className={cn("flex items-start gap-[10rem] rounded-xl border p-[12rem] transition cursor-pointer", on ? "border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)]" : "border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]")} onClick={() => st.toggleDoc(s.id, d.id)}>
                  <span onClick={(e) => e.stopPropagation()}>
                    <CheckBox checked={on} onChange={() => st.toggleDoc(s.id, d.id)} size="sm" />
                  </span>
                  <IconDocument size={16} className={cn("mt-[2rem] shrink-0", on ? "text-[var(--color-icon-brand)]" : "text-[var(--color-icon-tertiary)]")} />
                  <span className="typo-body-sm font-medium text-[var(--color-text-primary)] leading-snug break-all">{d.fileName}</span>
                </div>
              );
            })}
            <Button className="w-full mt-[8rem]" loading={loadingActs} disabled={s.selectedDocIds.length === 0} leftIcon={<IconList size={16} />} onClick={fetchActions}>
              선택 문서({s.selectedDocIds.length})로 SOP 추천정보 일괄 조회
            </Button>
          </div>
        )}
      </Card>

      {/* S05 조치 목록 */}
      <Card padded={false} className="flex flex-col min-h-[520px]" title="추천 조치 목록" subtitle="S05/S06 · 조치목록+상세정보를 한 번에 수신. 필요한 조치만 체크 (필수/선택 판단은 사용자)." right={s.recommendedActions.length > 0 ? <Badge tone="blue">{`${s.recommendedActions.length}건 수신`}</Badge> : undefined}>
        {loadingActs ? (
          <div className="flex-1 grid place-items-center typo-body-md text-[var(--color-text-tertiary)] py-[60rem]">
            <div className="text-center">
              <IconFlow size={32} className="mx-auto mb-[8rem] text-[var(--color-icon-brand)] pulse-soft" />
              선택 문서 내용 검색·정리 중
              <Dots />
              <div className="typo-body-sm mt-[4rem]">조치코드/조치명/단계/담당·지원·협업기관/세부행동/전파대상/필요자원</div>
            </div>
          </div>
        ) : s.recommendedActions.length === 0 ? (
          <div className="flex-1 grid place-items-center px-[20rem] pb-[20rem]">
            <EmptyState size="sm" icon={<IconList size={28} />} title="조치 목록이 없습니다" desc="문서를 선택하고 'SOP 추천정보 일괄 조회'를 누르면 T3Q가 조치 목록과 상세정보를 한 번에 반환합니다." />
          </div>
        ) : (
          <>
            <div className="px-[20rem] pb-[12rem] flex flex-wrap gap-[6rem] items-center">
              <FilterChip label="전체" size="sm" variant="outline" selected={stageFilter === "all"} onClick={() => setStageFilter("all")} />
              {STAGES.map((sg) => (
                <FilterChip key={sg} label={`${sg} ${s.recommendedActions.filter((a) => a.stage === sg).length}`} size="sm" variant="outline" selected={stageFilter === sg} onClick={() => setStageFilter(sg)} />
              ))}
              <div className="ml-auto w-[180rem]">
                <TextInput size="xs" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<IconSearch size={16} />} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto border-t border-[var(--color-border-subtle)] divide-y divide-[var(--color-border-subtle)] max-h-[640px]">
              {filtered.map((a) => {
                const on = s.selectedActionIds.includes(a.id);
                const open = openId === a.id;
                return (
                  <div key={a.id} className={cn("px-[16rem] py-[10rem]", on && "bg-[var(--color-surface-brand-subtle)]")}>
                    <div className="flex items-start gap-[10rem]">
                      <span className="pt-[2rem]">
                        <CheckBox checked={on} onChange={() => st.toggleAction(s.id, a.id)} size="sm" />
                      </span>
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpenId(open ? null : a.id)}>
                        <div className="flex items-center gap-[8rem] flex-wrap">
                          <Badge tone={STAGE_TONE[a.stage]}>{a.stage}</Badge>
                          <span className="typo-body-md font-medium text-[var(--color-text-primary)]">{a.title}</span>
                          <span className="ml-auto typo-body-sm font-medium text-[var(--color-text-brand)]">{a.leadDept}</span>
                          {open ? <IconChevronUp size={16} className="text-[var(--color-icon-tertiary)]" /> : <IconChevronDown size={16} className="text-[var(--color-icon-tertiary)]" />}
                        </div>
                        <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">{a.summary}</div>
                        {open && (
                          <div className="mt-[8rem] grid md:grid-cols-[1fr_180px] gap-[8rem] typo-body-sm">
                            <div className="rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-subtle)] p-[10rem]">
                              <div className="label mb-[4rem]">세부행동</div>
                              <ul className="list-disc pl-[16rem] space-y-[2rem] text-[var(--color-text-basic)]">
                                {a.details.slice(0, 6).map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-subtle)] p-[10rem] space-y-[6rem] text-[var(--color-text-basic)]">
                              <div>
                                <span className="label">지원부서</span>
                                <div>{a.supportDept || "-"}</div>
                              </div>
                              <div>
                                <span className="label">협업기관</span>
                                <div>{a.coopAgencies || "-"}</div>
                              </div>
                              <div>
                                <span className="label">전파대상</span>
                                <div>{a.targets.join(", ") || "-"}</div>
                              </div>
                              <div>
                                <span className="label">필요자원</span>
                                <div>{a.resources.join(", ") || "-"}</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* S06 선택·순서 */}
      <Card title="선택 조치 · 실행 순서" subtitle="S06 · 순서를 조정한 뒤 UNE가 기본 순차 Flow로 구성합니다. T3Q 재호출 없음." right={selected.length ? <Badge tone="green">{`${selected.length}건`}</Badge> : undefined}>
        {selected.length === 0 ? (
          <div className="typo-body-sm text-[var(--color-text-tertiary)] py-[24rem] text-center">좌측에서 조치를 체크하면 여기에 순서대로 쌓입니다</div>
        ) : (
          <ol className="space-y-[6rem]">
            {selected.map((a, i) => (
              <li key={a.id} className="flex items-center gap-[8rem] rounded-xl border border-[var(--color-border-subtle)] p-[10rem] bg-[var(--color-surface-primary)]">
                <span className="step-dot bg-[var(--color-surface-brand)] text-[var(--color-text-on-brand)]">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="typo-body-sm font-medium text-[var(--color-text-primary)] truncate">{a.title}</div>
                  <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">
                    {a.stage} · {a.leadDept}
                  </div>
                </div>
                <div className="flex flex-col">
                  <IconButton icon={<IconArrowUp size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="위로" disabled={i === 0} onClick={() => st.moveAction(s.id, a.id, -1)} />
                  <IconButton icon={<IconArrowDown size={12} />} variant="ghost" color="grayscale" size="4xs" aria-label="아래로" disabled={i === selected.length - 1} onClick={() => st.moveAction(s.id, a.id, 1)} />
                </div>
                <IconButton icon={<IconClose size={12} />} variant="ghost" color="grayscale" size="3xs" aria-label="제외" onClick={() => st.toggleAction(s.id, a.id)} />
              </li>
            ))}
          </ol>
        )}
        <div className="mt-[16rem] rounded-xl bg-[var(--color-surface-subtle)] p-[12rem] typo-body-sm text-[var(--color-text-tertiary)] leading-relaxed">
          <b className="text-[var(--color-text-primary)] font-medium">UNE 자동구성 범위</b>
          <br />
          선택 조치 → 기본 Process 노드, 순서대로 순차 연결, 노드 상세(담당·세부행동·전파대상·필요자원) 자동입력. 상황판단 노드·분기조건은 다음 단계의 편집기에서 사용자가 추가합니다.
        </div>
        <Button className="w-full mt-[12rem]" size="lg" disabled={selected.length === 0} leftIcon={<IconFlow size={16} />} rightIcon={<IconArrowRight size={16} />} onClick={build}>
          선택한 조치로 SOP 구성
        </Button>
        {s.sopVersions.length > 0 && (
          <Button className="w-full mt-[8rem]" variant="outline" onClick={onNext}>
            기존 SOP(v{s.sopVersions.length}) 편집으로 이동
          </Button>
        )}
      </Card>
    </div>
  );
}

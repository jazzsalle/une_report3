"use client";

import { useState } from "react";
import { SegmentedControl, Badge as DsBadge } from "@une-front/react-ui";
import type { AlertLevel, Situation } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Badge, Button, Card, Dots, EmptyState, TextArea, TextInput, VerifyBadge, useToast } from "@/components/ui";
import { IconSun, IconAi, IconPlus, IconArrowRight, IconClock, IconPin, IconSave, IconEducation, IconCheckCircle } from "@/components/icons";
import { mockWeatherAlerts } from "@/lib/seed/weather";
import { mockT3Q } from "@/lib/t3q/adapter";
import { cn, fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from "@/lib/utils";

const LEVELS: { value: AlertLevel; label: string }[] = ["관심", "주의", "경계", "심각"].map((l) => ({ value: l as AlertLevel, label: l }));

export function OverviewTab({ s, onNext }: { s: Situation; onNext: () => void }) {
  const toast = useToast();
  const update = useAppStore((st) => st.updateSituation);
  const setWeather = useAppStore((st) => st.setWeather);
  const addInjection = useAppStore((st) => st.addInjection);
  const [status, setStatus] = useState(s.currentStatus ?? "");
  const [loadingW, setLoadingW] = useState(false);
  const [loadingS, setLoadingS] = useState(false);
  const [inj, setInj] = useState({ at: toLocalInput(), message: "", target: "" });

  const ctx = { mode: s.mode, organization: s.organization, disasterType: s.disasterType, regions: s.regions.map((r) => r.sigungu ?? r.sido), currentStatus: s.currentStatus, alertLevel: s.alertLevel, trainingScenario: s.training?.scenario, injections: s.injections.map((i) => i.message) };

  const fetchAlerts = async () => {
    setLoadingW(true);
    await new Promise((r) => setTimeout(r, 600));
    setWeather(s.id, mockWeatherAlerts(s.organization, s.disasterType, s.baseTime), s.weatherSummary?.text);
    setLoadingW(false);
    toast.success("기상특보를 조회했습니다 (공식 API 열람용)");
  };
  const fetchSummary = async () => {
    setLoadingS(true);
    const alerts = s.weatherAlerts.length ? s.weatherAlerts : mockWeatherAlerts(s.organization, s.disasterType, s.baseTime);
    const text = await mockT3Q.weatherSummary(ctx, alerts);
    setWeather(s.id, alerts, text);
    setLoadingS(false);
  };
  const saveStatus = () => {
    update(s.id, { currentStatus: status }, { title: "현재상황 갱신", body: status, type: "user" });
    toast.success("현재상황을 저장했습니다");
  };

  return (
    <div className="p-[20rem] md:p-[28rem] grid xl:grid-cols-3 gap-[20rem]">
      <div className="xl:col-span-2 space-y-[20rem]">
        <Card title="상황 Context" subtitle="S01 · 지자체·재난유형·기준시각·발생/영향지역 + 현재상황(선택). 문서/SOP 추천 Context로 사용.">
          <div className="grid md:grid-cols-3 gap-[12rem] mb-[16rem]">
            <InfoTile icon={<IconClock size={16} />} k="기준시각" v={fmtDateTime(s.baseTime)} />
            <InfoTile icon={<IconPin size={16} />} k="발생·영향지역" v={s.regions.map((r) => [r.sigungu, r.dong].filter(Boolean).join(" ")).join(", ") || `${s.organization} 전역`} />
            <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
              <div className="label mb-[6rem]">위기경보</div>
              <SegmentedControl value={s.alertLevel} setValue={(v) => { const l = typeof v === "function" ? v(s.alertLevel) : v; update(s.id, { alertLevel: l }, { title: `위기경보 ${l} 단계로 변경`, type: "situation" }); }} options={LEVELS} size="sm" intent="primary" fullWidth />
            </div>
          </div>
          <TextArea label={s.mode === "actual" ? "현재상황" : "훈련 진행 메모"} value={status} onChange={(e) => setStatus(e.target.value)} placeholder="현재 상황을 간단히 입력" helperText="확정 사실이 아닌 추천 Context. 저장 시 이벤트 원장에 기록됩니다." minHeight={88} />
          <div className="flex justify-end mt-[8rem]">
            <Button size="sm" variant="outline" leftIcon={<IconSave size={16} />} onClick={saveStatus}>
              저장
            </Button>
          </div>
        </Card>

        {s.mode === "actual" ? (
          <Card
            title="기상정보"
            subtitle="S02 · 공식 기상특보(열람용)와 AI 기상요약을 출처·조회시각으로 구분하여 표시합니다."
            right={
              <div className="flex gap-[8rem]">
                <Button size="sm" variant="outline" loading={loadingW} leftIcon={<IconSun size={16} />} onClick={fetchAlerts}>
                  기상특보 조회
                </Button>
                <Button size="sm" loading={loadingS} leftIcon={<IconAi size={16} />} onClick={fetchSummary}>
                  AI 기상요약
                </Button>
              </div>
            }
          >
            {s.weatherAlerts.length === 0 ? (
              <EmptyState icon={<IconSun size={28} />} title="기상특보를 아직 조회하지 않았습니다" desc="기상청 공식 특보를 조회하면 발표시각·조회시각과 함께 원장에 기록됩니다." size="sm" />
            ) : (
              <div className="space-y-[8rem]">
                {s.weatherAlerts.map((a) => (
                  <div key={a.id} className="flex gap-[12rem] rounded-xl border border-[var(--color-border-subtle)] p-[12rem]">
                    <div className={cn("w-[4rem] rounded-max shrink-0", /경보/.test(a.type) ? "bg-[var(--red-500)]" : /주의보/.test(a.type) ? "bg-[var(--yellow-400)]" : "bg-[var(--light-blue-500)]")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[8rem] flex-wrap">
                        <span className="typo-body-md font-medium text-[var(--color-text-primary)]">{a.type}</span>
                        <span className="typo-body-sm text-[var(--color-text-tertiary)]">{a.area}</span>
                        <DsBadge label={`공식 · ${a.source}`} color="primary" variant="solid-pastel" size="xs" />
                        <span className="ml-auto typo-body-sm text-[var(--color-text-helper)]">
                          발표 {fmtDateTime(a.issuedAt)} · 발효 {fmtDateTime(a.effectiveAt)}
                        </span>
                      </div>
                      <div className="typo-body-md text-[var(--color-text-basic)] mt-[4rem]">{a.content}</div>
                    </div>
                  </div>
                ))}
                <div className="typo-body-sm text-[var(--color-text-helper)] text-right">조회시각 {fmtDateTime(s.weatherAlerts[0].fetchedAt)}</div>
              </div>
            )}
            {(s.weatherSummary || loadingS) && (
              <div className="mt-[12rem] rounded-xl bg-[var(--purple-25)] border border-[var(--purple-75)] p-[16rem]">
                <div className="flex items-center gap-[8rem] flex-wrap">
                  <IconAi size={16} className="text-[var(--purple-600)]" />
                  <span className="typo-body-md font-medium text-[var(--purple-700)]">AI 기상요약</span>
                  <Badge tone="purple">{s.weatherSummary?.source ?? "T3Q 기상 MCP(모의)"}</Badge>
                  <VerifyBadge v="unverified" />
                  {s.weatherSummary && <span className="ml-auto typo-body-sm text-[var(--color-text-helper)]">{fmtDateTime(s.weatherSummary.fetchedAt)}</span>}
                </div>
                <div className="typo-body-md text-[var(--color-text-basic)] leading-relaxed mt-[8rem]">
                  {loadingS && !s.weatherSummary ? (
                    <span className="text-[var(--color-text-tertiary)]">
                      요약 생성 중
                      <Dots />
                    </span>
                  ) : (
                    s.weatherSummary?.text
                  )}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <Card title="훈련계획 · 시나리오" subtitle="S02(훈련) · 훈련계획/시나리오와 최초 상황부여를 확인합니다.">
            {s.training ? (
              <div className="grid md:grid-cols-2 gap-[12rem]">
                <InfoTile icon={<IconEducation size={16} />} k="훈련계획" v={s.training.name} />
                <InfoTile icon={<IconClock size={16} />} k="일정" v={s.training.schedule || "-"} />
                <div className="md:col-span-2 rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
                  <div className="label">시나리오</div>
                  <div className="typo-body-md text-[var(--color-text-basic)] mt-[4rem] leading-relaxed">{s.training.scenario}</div>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
                  <div className="label">목적</div>
                  <div className="typo-body-md text-[var(--color-text-basic)] mt-[4rem]">{s.training.purpose || "-"}</div>
                </div>
                <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
                  <div className="label">참여기관</div>
                  <div className="mt-[4rem] flex flex-wrap gap-[4rem]">{s.training.agencies.length ? s.training.agencies.map((a) => <Badge key={a} tone="green">{a}</Badge>) : "-"}</div>
                </div>
              </div>
            ) : (
              <div className="typo-body-md text-[var(--color-text-tertiary)]">훈련계획이 없습니다</div>
            )}
          </Card>
        )}

        {s.mode === "training" && (
          <Card title="상황부여 등록" subtitle="UFR-001-007 · 훈련 진행 중 상황메시지를 시간순으로 등록하면 훈련 이벤트 원장에 누적되고 추가 SOP Context로 활용됩니다.">
            <div className="grid md:grid-cols-[200px_1fr_180px_auto] gap-[8rem] items-end">
              <TextInput label="상황부여 시각" type="datetime-local" value={inj.at} onChange={(e) => setInj({ ...inj, at: e.target.value })} />
              <TextInput label="상황메시지" value={inj.message} onChange={(e) => setInj({ ...inj, message: e.target.value })} placeholder="[상황부여 n] 태풍주의보 발효. 해안도로 월파 시작." />
              <TextInput label="관련 대상(선택)" value={inj.target} onChange={(e) => setInj({ ...inj, target: e.target.value })} placeholder="해운대구, 도로안전과" />
              <Button
                leftIcon={<IconPlus size={16} />}
                onClick={() => {
                  if (!inj.message.trim()) return;
                  addInjection(s.id, { at: fromLocalInput(inj.at), message: inj.message.trim(), target: inj.target.trim() || undefined });
                  setInj({ at: toLocalInput(), message: "", target: "" });
                  toast.success("상황부여를 등록했습니다");
                }}
              >
                등록
              </Button>
            </div>
            <div className="mt-[16rem] space-y-[6rem]">
              {[...s.injections]
                .sort((a, b) => a.at.localeCompare(b.at))
                .map((i, idx) => (
                  <div key={i.id} className="flex gap-[12rem] items-start rounded-xl border border-[var(--color-border-subtle)] p-[12rem]">
                    <span className="step-dot bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]">{idx + 1}</span>
                    <div className="flex-1">
                      <div className="typo-body-md font-medium text-[var(--color-text-primary)]">{i.message}</div>
                      <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">
                        {fmtDateTime(i.at)}
                        {i.target ? ` · 대상 ${i.target}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              {s.injections.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">등록된 상황부여가 없습니다</div>}
            </div>
          </Card>
        )}

        <div className="flex justify-end">
          <Button size="lg" rightIcon={<IconArrowRight size={16} />} onClick={onNext}>
            관련 문서 조회로 이동
          </Button>
        </div>
      </div>

      <div className="space-y-[20rem]">
        <Card title="최근 이벤트" subtitle="상황 이벤트 원장 (자동 누적)">
          <div className="space-y-[10rem] max-h-[560px] overflow-y-auto pr-[4rem]">
            {[...s.ledger]
              .reverse()
              .slice(0, 20)
              .map((e) => (
                <div key={e.id} className="flex gap-[10rem]">
                  <div className="typo-body-sm font-mono text-[var(--color-text-helper)] pt-[2rem] w-[40rem] shrink-0">{fmtTime(e.at)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="typo-body-sm font-medium text-[var(--color-text-primary)] leading-snug truncate">{e.title}</div>
                    {e.body && <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{e.body}</div>}
                  </div>
                  <VerifyBadge v={e.verify} />
                </div>
              ))}
            {s.ledger.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)]">이벤트가 없습니다</div>}
          </div>
        </Card>
        <Card title="진행 상태">
          <ul className="space-y-[8rem]">
            <Step done={s.weatherAlerts.length > 0 || s.mode === "training"} label={s.mode === "actual" ? "기상특보 조회" : "훈련 Context 설정"} />
            <Step done={s.recommendedDocs.length > 0} label="관련 문서 조회" />
            <Step done={s.selectedActionIds.length > 0} label="조치 선택·순서 확정" />
            <Step done={s.sopVersions.some((v) => v.kind === "confirmed")} label="SOP 실행본 확정" />
            <Step done={Object.values(s.runs).some((r) => r.status === "done")} label="SOP 실행·조치결과 입력" />
            <Step done={!!s.log.draft} label="상황일지 초안" />
            <Step done={s.report.sections.some((x) => x.body)} label="결과보고 초안" />
          </ul>
        </Card>
      </div>
    </div>
  );
}

function InfoTile({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
      <div className="label flex items-center gap-[4rem]">
        {icon} {k}
      </div>
      <div className="mt-[4rem] typo-body-md font-medium text-[var(--color-text-primary)]">{v}</div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-[8rem] typo-body-md">
      <span className={cn("inline-grid place-items-center size-[18rem] rounded-max", done ? "text-[var(--color-icon-success)]" : "text-[var(--color-icon-disabled)]")}>
        <IconCheckCircle size={16} />
      </span>
      <span className={cn(done ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-tertiary)]")}>{label}</span>
    </li>
  );
}

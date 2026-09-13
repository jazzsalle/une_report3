"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card as DsCard, SegmentedControl, ChoiceChip } from "@une-front/react-ui";
import { useAppStore, type NewSituationInput } from "@/store/useAppStore";
import { Button, Card, Field, PageHeader, SelectBox, TextArea, TextInput, useToast } from "@/components/ui";
import { IconFire, IconFlood, IconWind, IconSnow, IconEmergency, IconEducation, IconPlus, IconClose, IconArrowRight } from "@/components/icons";
import { AGENCIES, ORGANIZATIONS, REGIONS } from "@/lib/seed/regions";
import { cn, fromLocalInput, toLocalInput } from "@/lib/utils";
import type { AlertLevel, DisasterType, Mode, Region } from "@/lib/types";

const TYPES: { key: DisasterType; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: "flood", label: "풍수해 · 호우", icon: <IconFlood size={20} />, desc: "부산 풍수해 매뉴얼 1차 Seed" },
  { key: "typhoon", label: "풍수해 · 태풍", icon: <IconWind size={20} />, desc: "태풍 예비특보→경보 단계" },
  { key: "heavy_snow", label: "풍수해 · 대설", icon: <IconSnow size={20} />, desc: "적설·제설 대응" },
  { key: "wildfire", label: "산불", icon: <IconFire size={20} />, desc: "환경부 실무매뉴얼 교차검증" },
];

const LEVELS: { value: AlertLevel; label: string }[] = [
  { value: "관심", label: "관심" },
  { value: "주의", label: "주의" },
  { value: "경계", label: "경계" },
  { value: "심각", label: "심각" },
];

export default function NewSituationPage() {
  const router = useRouter();
  const toast = useToast();
  const create = useAppStore((s) => s.createSituation);

  const [mode, setMode] = useState<Mode>("actual");
  const [type, setType] = useState<DisasterType>("flood");
  const [org, setOrg] = useState("부산광역시");
  const [title, setTitle] = useState("");
  const [baseTime, setBaseTime] = useState(toLocalInput());
  const [alert, setAlert] = useState<AlertLevel>("주의");
  const [status, setStatus] = useState("");
  const [regions, setRegions] = useState<Region[]>([]);
  const [sigungu, setSigungu] = useState("");
  const [dong, setDong] = useState("");
  const [tr, setTr] = useState({ name: "", purpose: "", scenario: "", agencies: [] as string[], schedule: "" });

  const sigunguList = useMemo(() => REGIONS[org] ?? [], [org]);
  const autoTitle = useMemo(() => {
    const t = TYPES.find((x) => x.key === type)?.label ?? "";
    const d = new Date(baseTime);
    return mode === "actual" ? `${org.replace("광역시", "").replace("특별시", "")} ${t.split(" · ").pop()} 대응 (${d.getMonth() + 1}/${d.getDate()})` : `${d.getFullYear()} 안전한국훈련 – ${org} ${t.split(" · ").pop()} 대응훈련`;
  }, [mode, type, org, baseTime]);

  const addRegion = () => {
    if (!sigungu) return;
    setRegions((r) => [...r, { sido: org, sigungu, dong: dong || undefined }]);
    setSigungu("");
    setDong("");
  };

  const submit = () => {
    if (mode === "training" && !tr.scenario.trim()) {
      toast.error("훈련 시나리오를 입력하세요");
      return;
    }
    const input: NewSituationInput = {
      mode,
      title: title.trim() || autoTitle,
      disasterType: type,
      organization: org,
      baseTime: fromLocalInput(baseTime),
      regions,
      currentStatus: status.trim() || undefined,
      alertLevel: alert,
      training: mode === "training" ? { ...tr, name: tr.name.trim() || autoTitle } : undefined,
    };
    const id = create(input);
    toast.success("업무 세션을 생성했습니다");
    router.push(`/situations/${id}`);
  };

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1100px] mx-auto space-y-[20rem]">
      <PageHeader eyebrow="S01 · 업무유형 선택 및 시작" title="새 업무 시작" desc="실제재난은 지자체·재난유형·기준시각·발생/영향지역을, 안전한국훈련은 훈련계획·시나리오와 대상지역을 설정합니다. 이후 문서선택·SOP·상황일지·결과보고는 공통으로 진행됩니다." />

      {/* 업무유형 — DS Card selectable */}
      <div className="grid md:grid-cols-2 gap-[12rem]">
        {(
          [
            { m: "actual", icon: <IconEmergency size={24} />, t: "실제재난", d: "재난상황 등록 · 공식 기상특보 열람 · AI 기상요약", cls: "bg-[var(--color-surface-error-subtle)] text-[var(--color-icon-error)]" },
            { m: "training", icon: <IconEducation size={24} />, t: "안전한국훈련", d: "훈련계획·시나리오 설정 · 상황부여 시간순 등록 · 임무 전파/확인/완료", cls: "bg-[var(--color-surface-success-subtle)] text-[var(--color-icon-success)]" },
          ] as const
        ).map((o) => (
          <DsCard key={o.m} cardStyle="outline" selected={mode === o.m} onClick={() => setMode(o.m)} className="!rounded-xl">
            <DsCard.Body className="!p-[20rem] w-full flex gap-[16rem] items-start">
              <div className={cn("size-[48rem] rounded-xl grid place-items-center shrink-0", o.cls)}>{o.icon}</div>
              <div className="flex-1">
                <div className="typo-body-lg font-medium text-[var(--color-text-primary)]">{o.t}</div>
                <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem]">{o.d}</div>
              </div>
              <span className={cn("size-[20rem] rounded-max border-2 grid place-items-center shrink-0", mode === o.m ? "border-[var(--color-border-brand)]" : "border-[var(--color-border-default)]")}>{mode === o.m && <span className="size-[10rem] rounded-max bg-[var(--color-surface-brand)]" />}</span>
            </DsCard.Body>
          </DsCard>
        ))}
      </div>

      <Card title="기본 정보" subtitle="공통 Context — 문서·SOP 추천과 기상 조회에 사용됩니다.">
        <div className="grid md:grid-cols-2 gap-[20rem]">
          <Field label="재난유형" required>
            <div className="grid grid-cols-2 gap-[8rem]">
              {TYPES.map((t) => (
                <DsCard key={t.key} cardStyle="outline" selected={type === t.key} onClick={() => setType(t.key)} className="!rounded-lg">
                  <DsCard.Body className="!px-[12rem] !py-[10rem] w-full flex items-center gap-[10rem]">
                    <span className={cn("shrink-0", type === t.key ? "text-[var(--color-icon-brand)]" : "text-[var(--color-icon-tertiary)]")}>{t.icon}</span>
                    <span className="min-w-0">
                      <div className="typo-body-md font-medium text-[var(--color-text-primary)]">{t.label}</div>
                      <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{t.desc}</div>
                    </span>
                  </DsCard.Body>
                </DsCard>
              ))}
            </div>
          </Field>
          <div className="space-y-[16rem]">
            <SelectBox label={mode === "actual" ? "대응 지자체 *" : "훈련 대상 지자체 *"} value={org} onChange={(v) => { setOrg(v); setRegions([]); }} options={ORGANIZATIONS.map((o) => ({ value: o, label: o }))} />
            <TextInput label="기준시각 *" type="datetime-local" value={baseTime} onChange={(e) => setBaseTime(e.target.value)} />
            <Field label="위기경보 수준">
              <SegmentedControl value={alert} setValue={setAlert} options={LEVELS} intent="primary" fullWidth />
            </Field>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-[20rem] mt-[20rem]">
          <TextInput label="업무 제목" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle} helperText={`비우면 자동: ${autoTitle}`} clearable onClear={() => setTitle("")} />
          <Field label={mode === "actual" ? "발생·영향지역" : "훈련 대상지역"} hint="시·군·구 선택 후 추가. 읍·면·동은 선택 입력. 광역재난은 지자체 수준으로 시작 가능(미입력 허용).">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-[8rem] items-start">
              <SelectBox value={sigungu} onChange={setSigungu} placeholder="시·군·구 선택" options={sigunguList.map((s) => ({ value: s, label: s }))} />
              <TextInput placeholder="읍·면·동/장소" value={dong} onChange={(e) => setDong(e.target.value)} />
              <Button variant="outline" leftIcon={<IconPlus size={16} />} onClick={addRegion} aria-label="지역 추가">
                추가
              </Button>
            </div>
            <div className="flex flex-wrap gap-[6rem] mt-[10rem]">
              {regions.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-[4rem] bg-[var(--color-interaction-primary-bg-muted-default)] text-[var(--color-text-brand)] typo-body-sm font-medium px-[8rem] h-[24rem] rounded-sm">
                  {r.sigungu}
                  {r.dong ? ` ${r.dong}` : ""}
                  <button type="button" onClick={() => setRegions((x) => x.filter((_, j) => j !== i))} className="inline-flex" aria-label="삭제">
                    <IconClose size={12} />
                  </button>
                </span>
              ))}
            </div>
          </Field>
        </div>
        {mode === "actual" && (
          <div className="mt-[20rem]">
            <TextArea label="현재상황 (선택)" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="예) 호우주의보가 호우경보로 격상. 온천천 하상도로 침수 시작, 저지대 주택 침수 우려." helperText="보고서 확정사실이 아닌 문서/SOP 검색·추천 Context로 사용됩니다." minHeight={84} />
          </div>
        )}
      </Card>

      {mode === "training" && (
        <Card title="훈련계획 · 시나리오" subtitle="UFR-001-006 — 훈련 목적·대상지역·재난유형·참여기관·일정 등 훈련 Context">
          <div className="grid md:grid-cols-2 gap-[16rem]">
            <TextInput label="훈련계획명" value={tr.name} onChange={(e) => setTr({ ...tr, name: e.target.value })} placeholder={autoTitle} />
            <TextInput label="훈련 일정" value={tr.schedule} onChange={(e) => setTr({ ...tr, schedule: e.target.value })} placeholder="2026.10.22 09:00~12:00" />
            <div className="md:col-span-2">
              <TextInput label="훈련 목적" value={tr.purpose} onChange={(e) => setTr({ ...tr, purpose: e.target.value })} placeholder="재대본 가동·상황전파·주민대피 절차 숙달 및 유관기관 협업체계 점검" />
            </div>
            <div className="md:col-span-2">
              <TextArea label="훈련 시나리오 *" value={tr.scenario} onChange={(e) => setTr({ ...tr, scenario: e.target.value })} placeholder="태풍 북상 → 예비특보 → 주의보 → 경보 격상. 해안변 월파·저지대 침수·정전 상황 순차 부여" minHeight={96} />
            </div>
            <Field label="참여기관" className="md:col-span-2">
              <div className="flex flex-wrap gap-[6rem]">
                {AGENCIES.map((a) => (
                  <ChoiceChip key={a} label={a} size="sm" variant="outline" selected={tr.agencies.includes(a)} onClick={() => setTr({ ...tr, agencies: tr.agencies.includes(a) ? tr.agencies.filter((x) => x !== a) : [...tr.agencies, a] })} />
                ))}
              </div>
            </Field>
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-[8rem] pb-[24rem]">
        <Button variant="outline" onClick={() => router.push("/")}>
          취소
        </Button>
        <Button size="lg" rightIcon={<IconArrowRight size={16} />} onClick={submit}>
          업무 세션 생성
        </Button>
      </div>
    </div>
  );
}

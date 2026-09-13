"use client";

import { useEffect, useState } from "react";
import { Badge as DsBadge } from "@une-front/react-ui";
import { Button, Card, PageHeader, TextInput, useToast } from "@/components/ui";
import { IconRefresh, IconDownload, IconUpload, IconLinkOn, IconLinkOff } from "@/components/icons";
import { useAppStore } from "@/store/useAppStore";
import { downloadBlob } from "@/lib/utils";
import type { Situation } from "@/lib/types";

interface Health {
  reachable: boolean;
  model?: string;
  models?: string[];
  error?: string;
  baseUrl: string;
  fallback: boolean;
}

export default function SettingsPage() {
  const toast = useToast();
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const situations = useAppStore((s) => s.situations);
  const importSituation = useAppStore((s) => s.importSituation);
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(user.name);
  const [dept, setDept] = useState(user.dept);

  const check = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/uni/health", { cache: "no-store" });
      setH(await r.json());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const t = setTimeout(check, 0);
    return () => clearTimeout(t);
  }, []);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(Object.values(situations), null, 2)], { type: "application/json" });
    downloadBlob(blob, `disaster-log-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };
  const importAll = async (f: File) => {
    try {
      const arr = JSON.parse(await f.text()) as Situation[];
      (Array.isArray(arr) ? arr : [arr]).forEach((s) => s?.id && importSituation(s));
      toast.success("백업을 불러왔습니다");
    } catch {
      toast.error("JSON 파싱 실패");
    }
  };

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1000px] mx-auto space-y-[20rem]">
      <PageHeader eyebrow="설정" title="설정 · 연계 상태" />

      <Card
        title="UNI RAG System 연계"
        subtitle="SOP 자동생성(/chat/json)과 상황일지·결과보고 초안(일반 챗)에 사용. 인증·모델은 서버(.env.local)에서만 처리하며 브라우저로 노출되지 않습니다."
        right={
          <Button variant="outline" size="sm" loading={loading} leftIcon={<IconRefresh size={16} />} onClick={check}>
            재확인
          </Button>
        }
      >
        {h ? (
          <div className="space-y-[12rem]">
            <div className="flex items-center gap-[12rem] flex-wrap">
              <div className={`size-[40rem] rounded-xl grid place-items-center ${h.reachable ? "bg-[var(--color-surface-success-subtle)] text-[var(--color-icon-success)]" : "bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-icon-light-warning)]"}`}>{h.reachable ? <IconLinkOn size={20} /> : <IconLinkOff size={20} />}</div>
              <div>
                <div className="typo-body-lg font-medium text-[var(--color-text-primary)]">{h.reachable ? "연결됨" : "접속 불가 — 로컬 대체 생성 모드"}</div>
                <div className="typo-body-sm text-[var(--color-text-tertiary)]">
                  {h.baseUrl} {h.fallback ? "· UNI_FALLBACK=true" : "· 대체 비활성"}
                </div>
              </div>
              {h.model && <DsBadge label={`model: ${h.model}`} color="success" variant="solid-pastel" size="sm" />}
            </div>
            {h.error && (
              <div className="rounded-xl bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)] typo-body-sm p-[12rem] leading-relaxed">
                {h.error}
                <br />
                사내망(10.20.10.101)에서만 접속됩니다. 공인 주소는 출발지 IP 화이트리스트가 적용되어 있습니다.
              </div>
            )}
            {h.models && h.models.length > 0 && (
              <div>
                <div className="label mb-[4rem]">사용 가능 모델 (매 요청 조회 · 코드 고정 금지)</div>
                <div className="flex flex-wrap gap-[6rem]">
                  {h.models.map((m) => (
                    <DsBadge key={m} label={m} color={m.includes("unavailable") ? "grayscale" : "primary"} variant="solid-pastel" size="sm" />
                  ))}
                </div>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-[8rem]">
              <Info k="SOP 생성" v="POST /chat/json · SSE __compn__ → CompnSaveParams → ReactFlow" />
              <Info k="초안 생성" v="POST {UNI_CHAT_PATH} · SSE 텍스트 → 상황일지/보고서" />
              <Info k="__sources__" v="사내 문서 발췌 포함 → 화면 전달 제외" />
              <Info k="장애 시" v="로컬 규칙 기반 초안 · Seed 기반 SOP 생성으로 자동 대체 (출처 fallback 표시)" />
            </div>
          </div>
        ) : (
          <div className="typo-body-md text-[var(--color-text-tertiary)]">확인 중…</div>
        )}
      </Card>

      <Card title="T3Q 연계 (모의)" subtitle="이번 범위에서는 실제 T3Q API를 호출하지 않고 Seed 데이터로 동일 인터페이스(문서 파일명 목록 → 조치 전체 상세 → 기상요약)를 제공합니다.">
        <div className="grid md:grid-cols-3 gap-[8rem]">
          <Info k="searchDocuments" v="상황 Context → 파일명 목록 (관련도 비노출)" />
          <Info k="recommendActions" v="선택 문서 + Context → 조치목록+상세 1회 반환" />
          <Info k="weatherSummary" v="지자체·재난유형 → 기상 요약문 (확인 필요 표시)" />
        </div>
      </Card>

      <Card title="사용자">
        <div className="grid md:grid-cols-[1fr_1fr_auto] gap-[12rem] items-end">
          <TextInput label="이름" value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label="부서" value={dept} onChange={(e) => setDept(e.target.value)} />
          <Button
            onClick={() => {
              setUser({ name, dept });
              toast.success("저장했습니다");
            }}
          >
            저장
          </Button>
        </div>
      </Card>

      <Card title="데이터 백업" subtitle="브라우저(localStorage)에 저장됩니다. Vercel 배포 시에도 서버 DB 없이 동작하며, 필요 시 JSON으로 내보내기/불러오기 합니다.">
        <div className="flex gap-[8rem] flex-wrap">
          <Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={exportAll}>
            전체 내보내기(JSON)
          </Button>
          <label className="inline-flex">
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
            <span className="inline-flex items-center gap-[6rem] h-[36rem] px-[12rem] rounded-lg border border-[var(--color-interaction-secondary-border-default)] bg-[var(--color-surface-primary)] typo-body-md font-medium cursor-pointer hover:bg-[var(--color-interaction-secondary-bg-subtle-hover)]">
              <IconUpload size={16} /> 불러오기
            </span>
          </label>
        </div>
      </Card>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
      <div className="label">{k}</div>
      <div className="typo-body-sm text-[var(--color-text-basic)] mt-[2rem] leading-relaxed">{v}</div>
    </div>
  );
}

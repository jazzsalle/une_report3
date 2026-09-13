"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  SOP 라이브러리 — 상황과 독립된 SOP 목록 관리 (생성·복제·삭제·게시상태·사용이력·가져오기/내보내기)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge as DsBadge, Card as DsCard, FilterChip, IconButton, SegmentedControl } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { Button, Card, EmptyState, Modal, PageHeader, SelectBox, Stat, TextArea, TextInput, useToast } from "@/components/ui";
import { IconAi, IconCopy, IconDownload, IconEdit, IconFlow, IconNew, IconPlay, IconSearch, IconTrash, IconUpload, IconCheckCircle, IconList } from "@/components/icons";
import { ActionPickerModal } from "@/components/sop/ActionPickerModal";
import { templateSummary } from "@/components/sop/LibraryPicker";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import { actionsToCompns } from "@/lib/sop/adapter";
import { compnsToFlow } from "@/lib/sop/converters";
import { seedTemplates } from "@/lib/demo";
import type { DisasterType, SopTemplate } from "@/lib/types";
import { downloadBlob, relTime } from "@/lib/utils";

const TYPES: DisasterType[] = ["flood", "typhoon", "heavy_snow", "wildfire"];

export default function SopLibraryPage() {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const st = useAppStore();
  const [q, setQ] = useState("");
  const [type, setType] = useState<DisasterType | "all">("all");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", disasterType: "flood" as DisasterType, mode: "blank" as "blank" | "actions" | "ai" });

  const list = useMemo(
    () =>
      hydrated
        ? st.templateOrder
            .map((id) => st.templates[id])
            .filter(Boolean)
            .filter((t) => (type === "all" || t.disasterTypes.includes(type)) && (status === "all" || t.status === status) && (!q || `${t.name} ${t.description ?? ""} ${t.tags.join(" ")}`.includes(q)))
        : [],
    [hydrated, st.templateOrder, st.templates, type, status, q],
  );
  const all = hydrated ? st.templateOrder.map((id) => st.templates[id]).filter(Boolean) : [];

  const createAndGo = (extra?: { nodes?: SopTemplate["draft"]["nodes"]; edges?: SopTemplate["draft"]["edges"]; source?: SopTemplate["source"] }) => {
    const id = st.createTemplate({ name: form.name.trim() || `새 SOP (${DISASTER_LABEL[form.disasterType]})`, description: form.description.trim() || undefined, disasterTypes: [form.disasterType], ...extra });
    setCreateOpen(false);
    toast.success("SOP 초안을 만들었습니다");
    router.push(`/sops/${id}${form.mode === "ai" ? "?ai=1" : ""}`);
  };

  const exportAll = () => downloadBlob(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" }), `sop-library-${new Date().toISOString().slice(0, 10)}.json`);
  const importFile = async (f: File) => {
    try {
      const arr = JSON.parse(await f.text()) as SopTemplate[];
      (Array.isArray(arr) ? arr : [arr]).forEach((t) => t?.id && t.draft && st.importTemplate(t));
      toast.success("SOP 를 가져왔습니다");
    } catch {
      toast.error("JSON 파싱 실패");
    }
  };

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1400px] mx-auto space-y-[20rem]">
      <PageHeader
        eyebrow="SOP 관리"
        title="SOP 라이브러리"
        desc="상황이 없을 때 미리 SOP 를 만들어 두고, 상황 발생 시 선택해 바로 실행합니다. 편집(초안)과 실행(게시본)은 분리되며, 상황에 배포된 SOP 는 스냅샷으로 복사되어 라이브러리 원본과 독립적으로 실행됩니다."
        right={
          <div className="flex gap-[8rem] flex-wrap">
            <Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={exportAll} disabled={all.length === 0}>내보내기</Button>
            <label className="inline-flex">
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              <span className="inline-flex items-center gap-[6rem] h-[36rem] px-[12rem] rounded-lg border border-[var(--color-interaction-secondary-border-default)] bg-[var(--color-surface-primary)] typo-body-md font-medium cursor-pointer hover:bg-[var(--color-interaction-secondary-bg-subtle-hover)]"><IconUpload size={16} /> 가져오기</span>
            </label>
            <Button leftIcon={<IconNew size={16} />} onClick={() => setCreateOpen(true)}>새 SOP</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[12rem]">
        <Stat label="전체 SOP" value={all.length} icon={<IconFlow size={20} />} />
        <Stat label="게시(실행 가능)" value={all.filter((t) => t.status === "published").length} tone="green" icon={<IconCheckCircle size={20} />} />
        <Stat label="초안" value={all.filter((t) => t.status === "draft").length} tone="amber" icon={<IconEdit size={20} />} />
        <Stat label="배포 누계" value={all.reduce((n, t) => n + t.usage.length, 0)} tone="purple" icon={<IconPlay size={20} />} />
      </div>

      <Card padded={false}>
        <div className="p-[16rem] flex flex-wrap items-center gap-[10rem] border-b border-[var(--color-border-subtle)]">
          <SegmentedControl value={status} setValue={setStatus} options={[{ value: "all", label: "전체" }, { value: "published", label: "게시" }, { value: "draft", label: "초안" }]} size="sm" fitContent />
          <div className="flex gap-[6rem] flex-wrap">
            <FilterChip label="모든 유형" size="sm" variant="outline" selected={type === "all"} onClick={() => setType("all")} />
            {TYPES.map((t) => (
              <FilterChip key={t} label={DISASTER_LABEL[t]} size="sm" variant="outline" selected={type === t} onClick={() => setType(t)} />
            ))}
          </div>
          <div className="ml-auto w-[260rem]">
            <TextInput size="sm" placeholder="이름·설명·태그 검색" value={q} onChange={(e) => setQ(e.target.value)} leftIcon={<IconSearch size={16} />} clearable onClear={() => setQ("")} />
          </div>
        </div>

        {!hydrated ? (
          <div className="p-[24rem] typo-body-md text-[var(--color-text-tertiary)]">불러오는 중…</div>
        ) : list.length === 0 ? (
          <div className="p-[20rem]">
            <EmptyState
              icon={<IconFlow size={28} />}
              title={all.length === 0 ? "라이브러리가 비어 있습니다" : "조건에 맞는 SOP 가 없습니다"}
              desc="빈 캔버스에서 직접 구성하거나, 매뉴얼 조치 선택·AI 생성으로 만들 수 있습니다. 기본 SOP 3종(풍수해 초기대응·태풍 주민대피·산불 초동조치)을 불러와 시작해도 됩니다."
              action={
                <div className="flex gap-[8rem] flex-wrap justify-center">
                  <Button leftIcon={<IconNew size={16} />} onClick={() => setCreateOpen(true)}>새 SOP</Button>
                  <Button variant="outline" leftIcon={<IconList size={16} />} onClick={() => { const n = seedTemplates(); toast.success(n ? `기본 SOP ${n}종을 불러왔습니다` : "기본 SOP 가 이미 있습니다"); }}>기본 SOP 불러오기</Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-[12rem] p-[16rem]">
            {list.map((t) => {
              const sm = templateSummary(t);
              return (
                <DsCard key={t.id} cardStyle="outline" onClick={() => router.push(`/sops/${t.id}`)} className="!rounded-xl">
                  <DsCard.Body className="!p-[16rem] w-full">
                    <div className="flex items-center gap-[6rem] flex-wrap">
                      {t.status === "published" ? <DsBadge label={`게시 v${t.published?.version}`} color="success" variant="solid" size="xs" /> : <DsBadge label="초안" color="light-warning" variant="solid-pastel" size="xs" />}
                      {t.published && t.updatedAt > t.published.publishedAt && <DsBadge label="미게시 변경" color="grayscale" variant="outline" size="xs" />}
                      {t.disasterTypes.map((d) => <DsBadge key={d} label={DISASTER_LABEL[d]} color="primary" variant="outline" size="xs" />)}
                      <span className="ml-auto typo-body-sm text-[var(--color-text-helper)]">{relTime(t.updatedAt)}</span>
                    </div>
                    <div className="typo-body-lg font-medium text-[var(--color-text-primary)] mt-[10rem] leading-snug">{t.name}</div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)] mt-[2rem] line-clamp-2 min-h-[20rem]">{t.description ?? "설명 없음"}</div>
                    <div className="grid grid-cols-3 gap-[8rem] mt-[12rem]">
                      <Mini v={sm.steps} l="조치" />
                      <Mini v={sm.decisions} l="상황판단" />
                      <Mini v={t.usage.length} l="배포" />
                    </div>
                    <div className="flex items-center justify-between mt-[12rem] pt-[12rem] border-t border-[var(--color-border-subtle)]">
                      <span className="typo-body-sm text-[var(--color-text-tertiary)]">{{ manual: "직접 구성", actions: "조치 선택", ai: "AI 생성", situation: "상황에서 저장" }[t.source]} · {t.createdBy}</span>
                      <div className="flex items-center gap-[2rem]" onClick={(e) => e.stopPropagation()}>
                        <IconButton icon={<IconCopy size={16} />} variant="ghost" color="grayscale" size="xs" aria-label="복제" onClick={() => { const id = st.duplicateTemplate(t.id); if (id) toast.success("복제했습니다"); }} />
                        <IconButton icon={<IconTrash size={16} />} variant="ghost" color="grayscale" size="xs" aria-label="삭제" onClick={() => { if (confirm(`"${t.name}" 을 삭제할까요? 상황에 이미 배포된 스냅샷은 유지됩니다.`)) st.deleteTemplate(t.id); }} />
                        <Button size="xs" variant="outline" leftIcon={<IconEdit size={12} />} onClick={() => router.push(`/sops/${t.id}`)}>편집</Button>
                      </div>
                    </div>
                  </DsCard.Body>
                </DsCard>
              );
            })}
          </div>
        )}
      </Card>

      {/* 새 SOP 모달 */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="새 SOP 만들기"
        description="만드는 방식을 선택하세요. 만든 뒤 편집기에서 상황판단·분기를 추가하고 게시하면 상황에서 선택해 실행할 수 있습니다."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>취소</Button>
            {form.mode === "actions" ? (
              <Button leftIcon={<IconList size={16} />} onClick={() => { setCreateOpen(false); setPickOpen(true); }}>조치 선택으로 이동</Button>
            ) : (
              <Button leftIcon={form.mode === "ai" ? <IconAi size={16} /> : <IconNew size={16} />} onClick={() => createAndGo()}>{form.mode === "ai" ? "만들고 AI 생성" : "빈 SOP 만들기"}</Button>
            )}
          </>
        }
      >
        <div className="space-y-[12rem]">
          <SegmentedControl value={form.mode} setValue={(v) => setForm({ ...form, mode: typeof v === "function" ? v(form.mode) : v })} options={[{ value: "blank", label: "빈 캔버스" }, { value: "actions", label: "매뉴얼 조치 선택" }, { value: "ai", label: "AI 자유생성" }]} fullWidth intent="primary" />
          <TextInput label="SOP 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예) 호우경보 초기대응 표준 SOP" />
          <SelectBox label="재난유형" value={form.disasterType} onChange={(v) => setForm({ ...form, disasterType: v as DisasterType })} options={TYPES.map((t) => ({ value: t, label: DISASTER_LABEL[t] }))} />
          <TextArea label="설명(선택)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} minHeight={60} placeholder="적용 상황·근거 매뉴얼 등" />
        </div>
      </Modal>

      <ActionPickerModal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        disasterTypes={[form.disasterType]}
        onBuild={(actions) => {
          const compns = actionsToCompns(actions, "재난안전대책본부");
          const { nodes, edges } = compnsToFlow(compns, actions);
          setPickOpen(false);
          createAndGo({ nodes, edges, source: "actions" });
        }}
      />
    </div>
  );
}

function Mini({ v, l }: { v: React.ReactNode; l: string }) {
  return (
    <div className="rounded-lg bg-[var(--color-surface-subtle)] py-[6rem] text-center">
      <div className="typo-body-md font-medium text-[var(--color-text-primary)]">{v}</div>
      <div className="typo-body-sm text-[var(--color-text-tertiary)]">{l}</div>
    </div>
  );
}

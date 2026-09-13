"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  설정 › 조직·연락처 관리 — 상황전파 수신대상
//  · 조직도: 구분(지휘부 · 13개 협업기능별 실무반 · 유관기관) → 실무반·기관 → 부서 → 사람(직위)  ※ 부산 풍수해 매뉴얼 재대본 편성
//  · 연락처 목록: 표 편집 · 엑셀 양식 다운로드 · 엑셀 일괄 업로드(미리보기·검증) · 내보내기
//  · 전송그룹: 주소록 그룹 등록 → 상황전파 시 그룹 단위 선택
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge as DsBadge, Checkbox as DsCheckbox, ChoiceChip, IconButton, SegmentedControl } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { Button, Card, EmptyState, Help, Modal, PageHeader, SelectBox, TextInput, useToast } from "@/components/ui";
import { IconDownload, IconUpload, IconPlus, IconEdit, IconTrash, IconSearch, IconPerson, IconMail, IconPhone, IconChevronLeft, IconCheckCircle, IconWarning, IconChevronDown, IconChevronRight, IconSend } from "@/components/icons";
import { buildExportWorkbook, buildTemplateWorkbook, isValidEmail, normalizePhone, parseContactsFile, XLSX_MIME, type ParseResult } from "@/lib/org/excel";
import { SEED_CONTACTS, SEED_GROUPS } from "@/lib/seed/contacts";
import { ContactPicker } from "@/components/org/ContactPicker";
import type { Contact, ContactInput, OrgType, SendGroup } from "@/lib/types";
import { ORG_TYPE_LABEL } from "@/lib/types";
import { cn, downloadBlob, fmtDateTime } from "@/lib/utils";

const EMPTY: ContactInput = { orgType: "team", unit: "", dept: "", position: "", name: "", phone: "", email: "", note: "" };
const ORG_ORDER: OrgType[] = ["command", "team", "agency"];
const ORG_TONE: Record<OrgType, string> = { command: "bg-[var(--red-25)] text-[var(--red-600)]", team: "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]", agency: "bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]" };
const ORG_SHORT: Record<OrgType, string> = { command: "지휘부", team: "실무반", agency: "유관기관" };
const TEAMS_13 = ["재난상황관리반", "긴급생활안정지원반", "긴급통신지원반", "시설응급복구반", "에너지기능복구반", "재난자원지원반", "교통대책반", "의료및방역서비스반", "재난현장환경정비반", "자원봉사관리반", "사회질서유지반", "수색구조구급반", "재난수습홍보반"];

type Tab = "tree" | "list" | "groups";

export default function OrgPage() {
  const toast = useToast();
  const hydrated = useHydrated();
  const sp = useSearchParams();
  const contacts = useAppStore((s) => s.contacts);
  const groups = useAppStore((s) => s.groups);
  const addContact = useAppStore((s) => s.addContact);
  const updateContact = useAppStore((s) => s.updateContact);
  const deleteContacts = useAppStore((s) => s.deleteContacts);
  const importContacts = useAppStore((s) => s.importContacts);
  const addGroup = useAppStore((s) => s.addGroup);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);

  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "tree");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<OrgType | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [delOpen, setDelOpen] = useState(false);
  const [parsed, setParsed] = useState<(ParseResult & { fileName: string }) | null>(null);
  const [mode, setMode] = useState<"append" | "merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [openUnit, setOpenUnit] = useState<Record<string, boolean>>({});
  const [groupEdit, setGroupEdit] = useState<SendGroup | "new" | null>(null);
  const [gName, setGName] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gMembers, setGMembers] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const units = useMemo(() => Array.from(new Set(contacts.map((c) => c.unit))).sort((a, b) => a.localeCompare(b, "ko")), [contacts]);
  const depts = useMemo(() => Array.from(new Set(contacts.map((c) => c.dept))).sort((a, b) => a.localeCompare(b, "ko")), [contacts]);
  const visible = useMemo(
    () => contacts.filter((c) => (!typeFilter || c.orgType === typeFilter) && (!q || `${c.unit} ${c.dept} ${c.position} ${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => ORG_ORDER.indexOf(a.orgType) - ORG_ORDER.indexOf(b.orgType) || a.unit.localeCompare(b.unit, "ko") || a.dept.localeCompare(b.dept, "ko") || a.name.localeCompare(b.name, "ko")),
    [contacts, typeFilter, q],
  );
  const tree = useMemo(() => {
    const m = new Map<OrgType, Map<string, Map<string, Contact[]>>>();
    for (const c of contacts) {
      if (typeFilter && c.orgType !== typeFilter) continue;
      if (q && !`${c.unit} ${c.dept} ${c.position} ${c.name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())) continue;
      const t = m.get(c.orgType) ?? new Map<string, Map<string, Contact[]>>();
      const u = t.get(c.unit) ?? new Map<string, Contact[]>();
      const d = u.get(c.dept) ?? [];
      d.push(c);
      u.set(c.dept, d);
      t.set(c.unit, u);
      m.set(c.orgType, t);
    }
    return m;
  }, [contacts, typeFilter, q]);
  const allVisibleSel = visible.length > 0 && visible.every((c) => sel.has(c.id));

  const openNew = (preset?: Partial<ContactInput>) => { setForm({ ...EMPTY, ...preset }); setEditing("new"); };
  const openEdit = (c: Contact) => { setForm({ orgType: c.orgType, unit: c.unit, dept: c.dept, position: c.position, name: c.name, phone: c.phone, email: c.email ?? "", note: c.note ?? "" }); setEditing(c); };
  const save = () => {
    const data: ContactInput = { ...form, unit: form.unit.trim() || (form.orgType === "agency" ? form.dept.trim() : "미배정"), dept: form.dept.trim(), phone: normalizePhone(form.phone), email: form.email?.trim() || undefined, note: form.note?.trim() || undefined };
    if (!data.dept || !data.name.trim() || !data.phone) return toast.error("부서명·이름·전화번호는 필수입니다");
    if (!isValidEmail(data.email ?? "")) return toast.error("이메일 형식을 확인하세요");
    if (editing === "new") { addContact(data); toast.success("연락처를 등록했습니다"); }
    else if (editing) { updateContact(editing.id, data); toast.success("수정했습니다"); }
    setEditing(null);
  };
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllVisible = () => setSel((p) => { const n = new Set(p); if (allVisibleSel) visible.forEach((c) => n.delete(c.id)); else visible.forEach((c) => n.add(c.id)); return n; });

  const downloadTemplate = () => { downloadBlob(new Blob([buildTemplateWorkbook()], { type: XLSX_MIME }), "조직연락처_업로드양식.xlsx"); toast.success("업로드 양식을 다운로드했습니다"); };
  const exportAll = () => downloadBlob(new Blob([buildExportWorkbook(contacts)], { type: XLSX_MIME }), `조직연락처_${new Date().toISOString().slice(0, 10)}.xlsx`);
  const onFile = async (f: File) => {
    setBusy(true);
    try {
      const r = await parseContactsFile(f);
      setParsed({ ...r, fileName: f.name });
      if (r.missing.length) toast.warning(`필수 컬럼 누락: ${r.missing.join(", ")}`);
    } catch (e) {
      toast.error(`파일을 읽을 수 없습니다: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const applyImport = () => {
    if (!parsed) return;
    const ok = parsed.rows.filter((r) => r.errors.length === 0).map((r) => r.data);
    if (!ok.length) return toast.error("가져올 수 있는 행이 없습니다");
    const { added, updated } = importContacts(ok, mode);
    setParsed(null);
    toast.success(`${mode === "replace" ? "전체 교체 · " : ""}추가 ${added}명${updated ? ` · 갱신 ${updated}명` : ""}`);
  };
  const loadSeed = () => {
    const { added, updated } = importContacts(SEED_CONTACTS, "merge");
    // 기본 전송그룹 (이름 매칭)
    const all = useAppStore.getState().contacts;
    const existing = new Set(useAppStore.getState().groups.map((g) => g.name));
    let g = 0;
    for (const sg of SEED_GROUPS) {
      if (existing.has(sg.name)) continue;
      const ids = all.filter((c) => sg.match(c)).map((c) => c.id);
      if (ids.length) { addGroup({ name: sg.name, description: sg.description, memberIds: ids }); g++; }
    }
    toast.success(`기본 연락처 ${added + updated}명 · 전송그룹 ${g}개를 불러왔습니다 (부산 풍수해 매뉴얼 재대본 편성)`);
  };

  const openGroup = (g: SendGroup | "new") => {
    if (g === "new") { setGName(""); setGDesc(""); setGMembers(new Set()); }
    else { setGName(g.name); setGDesc(g.description ?? ""); setGMembers(new Set(g.memberIds)); }
    setGroupEdit(g);
  };
  const saveGroup = () => {
    if (!gName.trim()) return toast.error("그룹 이름을 입력하세요");
    if (!gMembers.size) return toast.error("구성원을 1명 이상 선택하세요");
    if (groupEdit === "new") { addGroup({ name: gName.trim(), description: gDesc.trim() || undefined, memberIds: Array.from(gMembers) }); toast.success("전송그룹을 등록했습니다"); }
    else if (groupEdit) { updateGroup(groupEdit.id, { name: gName.trim(), description: gDesc.trim() || undefined, memberIds: Array.from(gMembers) }); toast.success("전송그룹을 수정했습니다"); }
    setGroupEdit(null);
  };

  if (!hydrated) return <div className="p-[32rem] typo-body-md text-[var(--color-text-tertiary)]">불러오는 중…</div>;

  const okRows = parsed?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const errRows = (parsed?.rows.length ?? 0) - okRows;
  const teamCount = new Set(contacts.filter((c) => c.orgType === "team").map((c) => c.unit)).size;

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1240px] mx-auto space-y-[20rem]">
      <div className="flex items-start gap-[12rem]">
        <Link href="/settings" className="size-[36rem] grid place-items-center rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] shrink-0 text-[var(--color-icon-secondary)] mt-[6rem]"><IconChevronLeft size={16} /></Link>
        <div className="flex-1">
          <PageHeader
            eyebrow="설정"
            title={<span className="inline-flex items-center gap-[8rem]">조직·연락처 관리 <Help size="lg" title="조직 구성 기준" text={"부산광역시 풍수해 재난 현장조치 행동매뉴얼의 재난안전대책본부 편성을 따릅니다.\n\n· 지휘부: 본부장·차장·총괄조정관·통제관·담당관\n· 실무반: 13개 협업기능별 실무반(재난상황관리반 등)과 각 담당부서\n· 유관기관: 기상청·53사단·한전·KT·소방·경찰 등\n\n조치(행동요령)의 주관부서·지원부서·협업기관은 조치별 역할이므로 조직 속성이 아니라 SOP 노드에 기록되고, 상황전파 시 해당 부서 인원을 자동 추천합니다."} /></span>}
            desc="상황전파 수신대상 연락망입니다. 조직도(구분 → 실무반·기관 → 부서 → 사람)로 관리하고, 전송그룹을 만들어 두면 SOP 실행 중 그룹 단위로 발송할 수 있습니다."
            right={
              <div className="flex gap-[8rem] flex-wrap">
                <Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={downloadTemplate}>엑셀 양식 다운로드</Button>
                <Button variant="outline" leftIcon={<IconUpload size={16} />} loading={busy} onClick={() => fileRef.current?.click()}>엑셀 일괄 업로드</Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <Button leftIcon={<IconPlus size={16} />} onClick={() => openNew()}>개별 등록</Button>
              </div>
            }
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-4 gap-[12rem]">
        <Summary icon={<IconPerson size={20} />} label="등록 인원" value={`${contacts.length}명`} sub={`지휘부 ${contacts.filter((c) => c.orgType === "command").length} · 실무반 ${contacts.filter((c) => c.orgType === "team").length} · 유관기관 ${contacts.filter((c) => c.orgType === "agency").length}`} />
        <Summary icon={<IconPhone size={20} />} label="실무반 · 부서" value={`${teamCount}개 반 · ${depts.length}개 부서`} sub={`매뉴얼 기준 13개 협업기능반${teamCount < 13 && contacts.length ? ` (미편성 ${13 - teamCount})` : ""}`} />
        <Summary icon={<IconSend size={20} />} label="전송그룹" value={`${groups.length}개`} sub={groups.slice(0, 2).map((g) => g.name).join(" · ") || "그룹을 만들어 두면 발송이 빨라집니다"} />
        <Summary icon={<IconMail size={20} />} label="이메일 보유" value={`${contacts.filter((c) => c.email).length}명`} sub="이메일 채널 전파 가능 인원" />
      </div>

      <Card padded={false}
        title={
          <div className="flex items-center gap-[12rem]">
            <SegmentedControl value={tab} setValue={setTab} size="sm" fitContent options={[{ value: "tree", label: "조직도" }, { value: "list", label: `연락처 목록 ${contacts.length}` }, { value: "groups", label: `전송그룹 ${groups.length}` }]} />
          </div>
        }
        right={
          tab !== "groups" ? (
            <div className="flex items-center gap-[8rem] flex-wrap justify-end">
              <div className="flex gap-[4rem]">
                <ChoiceChip label="전체" size="sm" variant="outline" selected={!typeFilter} onClick={() => setTypeFilter(null)} />
                {ORG_ORDER.map((t) => <ChoiceChip key={t} label={ORG_SHORT[t]} size="sm" variant="outline" selected={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} />)}
              </div>
              <div className="relative">
                <IconSearch size={16} className="absolute left-[10rem] top-1/2 -translate-y-1/2 text-[var(--color-icon-tertiary)]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서·실무반·전화 검색" className="h-[32rem] w-[220rem] pl-[32rem] pr-[10rem] rounded-lg border border-[var(--color-border-default)] typo-body-sm bg-[var(--color-surface-primary)] outline-none focus:border-[var(--color-border-brand)]" />
              </div>
              {sel.size > 0 && <Button size="sm" variant="danger" leftIcon={<IconTrash size={16} />} onClick={() => setDelOpen(true)}>선택 삭제 ({sel.size})</Button>}
              {contacts.length > 0 && <Button size="sm" variant="outline" leftIcon={<IconDownload size={16} />} onClick={exportAll}>내보내기(xlsx)</Button>}
            </div>
          ) : (
            <Button size="sm" leftIcon={<IconPlus size={16} />} onClick={() => openGroup("new")}>전송그룹 만들기</Button>
          )
        }
      >
        {contacts.length === 0 && tab !== "groups" ? (
          <div className="p-[24rem]">
            <EmptyState icon={<IconPerson size={28} />} title="등록된 연락처가 없습니다" desc="엑셀 양식을 내려받아 채운 뒤 일괄 업로드하거나 개별 등록으로 시작하세요. 부산 풍수해 매뉴얼 재대본 편성(지휘부·13개 실무반·유관기관) 기준의 시연용 기본 연락처와 전송그룹을 불러올 수도 있습니다."
              action={<div className="flex gap-[8rem] flex-wrap justify-center"><Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={downloadTemplate}>엑셀 양식 다운로드</Button><Button variant="outline" leftIcon={<IconUpload size={16} />} onClick={() => fileRef.current?.click()}>엑셀 일괄 업로드</Button><Button onClick={loadSeed}>기본 조직·연락처 불러오기</Button></div>} />
          </div>
        ) : tab === "tree" ? (
          /* ── 조직도 ── */
          <div className="border-t border-[var(--color-border-subtle)] p-[16rem] space-y-[16rem]">
            {ORG_ORDER.filter((t) => tree.has(t)).map((t) => {
              const unitsMap = tree.get(t)!;
              return (
                <section key={t}>
                  <div className="flex items-center gap-[8rem] mb-[8rem]">
                    <span className={cn("rounded-sm px-[8rem] h-[24rem] inline-flex items-center typo-body-sm font-medium", ORG_TONE[t])}>{ORG_TYPE_LABEL[t]}</span>
                    <span className="typo-body-sm text-[var(--color-text-tertiary)]">{unitsMap.size}개 {t === "team" ? "실무반" : t === "agency" ? "기관" : "조직"} · {Array.from(unitsMap.values()).reduce((n, u) => n + Array.from(u.values()).flat().length, 0)}명</span>
                    <Button size="xs" variant="ghost" className="ml-auto" leftIcon={<IconPlus size={12} />} onClick={() => openNew({ orgType: t })}>이 구분에 등록</Button>
                  </div>
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-[10rem]">
                    {Array.from(unitsMap.entries()).map(([unit, deptMap]) => {
                      const key = `${t}|${unit}`;
                      const total = Array.from(deptMap.values()).flat().length;
                      const isOpen = openUnit[key] ?? true;
                      return (
                        <div key={unit} className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)]">
                          <div className="flex items-center gap-[6rem] px-[12rem] h-[40rem] border-b border-[var(--color-border-subtle)]">
                            <button onClick={() => setOpenUnit({ ...openUnit, [key]: !isOpen })} className="text-[var(--color-icon-tertiary)]">{isOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}</button>
                            <span className="typo-body-md font-medium text-[var(--color-text-primary)] truncate flex-1">{unit}</span>
                            <DsBadge label={`${deptMap.size}부서 · ${total}명`} color="grayscale" variant="solid-pastel" size="xs" />
                            <IconButton icon={<IconPlus size={14} />} variant="ghost" color="grayscale" size="3xs" aria-label="이 실무반에 등록" onClick={() => openNew({ orgType: t, unit })} />
                          </div>
                          {isOpen && (
                            <div className="p-[8rem] space-y-[6rem]">
                              {Array.from(deptMap.entries()).map(([dept, people]) => (
                                <div key={dept} className="rounded-lg bg-[var(--color-surface-subtle)] p-[8rem]">
                                  <div className="flex items-center gap-[6rem] mb-[4rem]">
                                    <span className="typo-body-sm font-medium text-[var(--color-text-secondary)]">{dept}</span>
                                    <span className="typo-body-sm text-[var(--color-text-helper)]">{people.length}명</span>
                                    <button onClick={() => openNew({ orgType: t, unit, dept })} className="ml-auto typo-body-sm text-[var(--color-text-brand)] hover:underline">+ 추가</button>
                                  </div>
                                  <div className="flex flex-wrap gap-[4rem]">
                                    {people.map((c) => (
                                      <button key={c.id} onClick={() => openEdit(c)} title={`${c.phone}${c.email ? " · " + c.email : ""}${c.note ? " · " + c.note : ""}`} className="inline-flex items-center gap-[4rem] h-[26rem] px-[8rem] rounded-sm bg-[var(--color-surface-primary)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-brand)] typo-body-sm">
                                        <span className="font-medium text-[var(--color-text-primary)]">{c.name}</span>
                                        <span className="text-[var(--color-text-tertiary)]">{c.position}</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {tree.size === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)] text-center py-[24rem]">검색 결과가 없습니다</div>}
            {teamCount < 13 && !q && !typeFilter && (
              <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-[12rem] typo-body-sm text-[var(--color-text-tertiary)] leading-relaxed">
                매뉴얼 13개 협업기능반 중 미편성: {TEAMS_13.filter((n) => !units.includes(n)).join(", ") || "-"} — 「개별 등록」에서 실무반 이름을 선택해 채우거나 엑셀로 일괄 업로드하세요.
              </div>
            )}
          </div>
        ) : tab === "list" ? (
          /* ── 연락처 목록 ── */
          <div className="overflow-x-auto border-t border-[var(--color-border-subtle)]">
            <table className="w-full min-w-[980px] typo-body-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="w-[44rem] px-[16rem] py-[10rem]"><DsCheckbox checked={allVisibleSel} onCheckedChange={toggleAllVisible} size="sm" aria-label="전체 선택" /></th>
                  <Th>구분</Th><Th>실무반/기관</Th><Th>부서명</Th><Th>직위</Th><Th>이름</Th><Th>전화번호</Th><Th>이메일</Th><Th>비고</Th><Th>수정</Th><th className="w-[72rem]" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className={cn("border-t border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]", sel.has(c.id) && "bg-[var(--color-surface-brand-subtle)]")}>
                    <td className="px-[16rem] py-[8rem]"><DsCheckbox checked={sel.has(c.id)} onCheckedChange={() => toggleSel(c.id)} size="sm" aria-label={`${c.name} 선택`} /></td>
                    <Td><span className={cn("rounded-sm px-[6rem] h-[20rem] inline-flex items-center typo-body-sm", ORG_TONE[c.orgType])}>{ORG_SHORT[c.orgType]}</span></Td>
                    <Td className="text-[var(--color-text-secondary)]">{c.unit}</Td>
                    <Td className="font-medium text-[var(--color-text-primary)]">{c.dept}</Td>
                    <Td>{c.position || <span className="text-[var(--color-text-helper)]">-</span>}</Td>
                    <Td className="font-medium text-[var(--color-text-primary)]">{c.name}</Td>
                    <Td className="font-mono">{c.phone}</Td>
                    <Td>{c.email ? <a href={`mailto:${c.email}`} className="text-[var(--color-text-brand)] hover:underline">{c.email}</a> : <span className="text-[var(--color-text-helper)]">-</span>}</Td>
                    <Td className="text-[var(--color-text-tertiary)] max-w-[200rem] truncate">{c.note ?? ""}</Td>
                    <Td className="text-[var(--color-text-helper)] whitespace-nowrap">{fmtDateTime(c.updatedAt)}</Td>
                    <td className="px-[8rem] py-[6rem] whitespace-nowrap">
                      <IconButton icon={<IconEdit size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="수정" onClick={() => openEdit(c)} />
                      <IconButton icon={<IconTrash size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="삭제" onClick={() => { setSel(new Set([c.id])); setDelOpen(true); }} />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={11} className="px-[16rem] py-[24rem] text-center text-[var(--color-text-tertiary)]">검색 결과가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── 전송그룹 ── */
          <div className="border-t border-[var(--color-border-subtle)] p-[16rem]">
            {groups.length === 0 ? (
              <EmptyState icon={<IconSend size={28} />} title="전송그룹이 없습니다" desc="자주 함께 전파하는 대상(예: 재대본 지휘부, 13개 실무반 반장, 유관기관 상황실)을 그룹으로 묶어 두면 SOP 실행 중 한 번에 선택할 수 있습니다."
                action={<div className="flex gap-[8rem]"><Button leftIcon={<IconPlus size={16} />} onClick={() => openGroup("new")}>전송그룹 만들기</Button>{contacts.length === 0 && <Button variant="outline" onClick={loadSeed}>기본 조직·그룹 불러오기</Button>}</div>} />
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-[10rem]">
                {groups.map((g) => {
                  const members = contacts.filter((c) => g.memberIds.includes(c.id));
                  return (
                    <div key={g.id} className="rounded-xl border border-[var(--color-border-subtle)] p-[12rem] flex flex-col gap-[8rem]">
                      <div className="flex items-start gap-[8rem]">
                        <span className="inline-grid place-items-center size-[36rem] rounded-lg bg-[var(--purple-25)] text-[var(--purple-600)] shrink-0"><IconSend size={16} /></span>
                        <div className="min-w-0 flex-1">
                          <div className="typo-body-md font-medium text-[var(--color-text-primary)] truncate">{g.name}</div>
                          <div className="typo-body-sm text-[var(--color-text-tertiary)] line-clamp-2">{g.description ?? ""}</div>
                        </div>
                        <DsBadge label={`${members.length}명`} color="primary" variant="solid-pastel" size="xs" />
                      </div>
                      <div className="flex flex-wrap gap-[4rem] max-h-[72rem] overflow-hidden">
                        {members.slice(0, 10).map((c) => <span key={c.id} className="h-[22rem] px-[6rem] rounded-sm bg-[var(--color-surface-subtle)] typo-body-sm text-[var(--color-text-secondary)] inline-flex items-center">{c.name} {c.position}</span>)}
                        {members.length > 10 && <span className="typo-body-sm text-[var(--color-text-helper)] self-center">외 {members.length - 10}명</span>}
                      </div>
                      <div className="flex gap-[6rem] mt-auto pt-[4rem] border-t border-[var(--color-border-subtle)]">
                        <span className="typo-body-sm text-[var(--color-text-helper)] self-center">{fmtDateTime(g.updatedAt)}</span>
                        <Button size="xs" variant="outline" className="ml-auto" leftIcon={<IconEdit size={12} />} onClick={() => openGroup(g)}>편집</Button>
                        <Button size="xs" variant="ghost" leftIcon={<IconTrash size={12} />} onClick={() => { deleteGroup(g.id); toast.success("그룹을 삭제했습니다"); }}>삭제</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="일괄 업로드 안내" subtitle="양식의 1행 헤더는 유지하고 예시 행은 지운 뒤 업로드하세요. 헤더 표기가 달라도(부서/소속, 직급, 성명, 연락처/휴대폰, 기능반/기관명 등) 자동 인식하고, 구분·실무반은 병합셀처럼 첫 행에만 적어도 이어받습니다.">
        <div className="grid md:grid-cols-3 gap-[8rem]">
          <Info k="① 양식 다운로드" v="「연락처」 시트: 구분(지휘부/실무반/유관기관) · 실무반/기관 · 부서명 · 직위 · 이름 · 전화번호 · 이메일 · 비고. 「작성안내」 시트에 13개 실무반 목록" />
          <Info k="② 작성 후 업로드" v=".xlsx / .xls / .csv 지원. 미리보기에서 오류 행(이름·부서·전화 누락)과 구분 추정 결과를 확인하고 가져옵니다" />
          <Info k="③ 가져오기 방식" v="추가 · 병합(전화번호 또는 부서+이름이 같으면 갱신) · 전체 교체 중 선택" />
        </div>
      </Card>

      {/* 등록/수정 모달 */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "연락처 등록" : "연락처 수정"} size="md"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>취소</Button><Button leftIcon={<IconCheckCircle size={16} />} onClick={save}>{editing === "new" ? "등록" : "저장"}</Button></>}>
        <div className="grid md:grid-cols-2 gap-[12rem]">
          <SelectBox label="구분 *" value={form.orgType} onChange={(v) => setForm({ ...form, orgType: v as OrgType })} options={ORG_ORDER.map((t) => ({ value: t, label: ORG_TYPE_LABEL[t] }))} />
          <TextInput label={form.orgType === "agency" ? "기관명 *" : form.orgType === "command" ? "조직 (지휘부)" : "실무반 *"} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={form.orgType === "agency" ? "부산소방재난본부" : form.orgType === "command" ? "재난안전대책본부 지휘부" : "재난상황관리반"} list="unit-list" />
          <datalist id="unit-list">{(form.orgType === "team" ? Array.from(new Set([...TEAMS_13, ...units])) : units).map((u) => <option key={u} value={u} />)}</datalist>
          <TextInput label="부서명 *" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} placeholder="자연재난과" list="dept-list" />
          <datalist id="dept-list">{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <TextInput label="직위·직책" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="팀장" />
          <TextInput label="이름 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
          <TextInput label="전화번호 *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => setForm((f) => ({ ...f, phone: normalizePhone(f.phone) }))} placeholder="010-0000-0000" />
          <TextInput label="이메일" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.go.kr" />
          <TextInput label="비고" value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="야간 당직 총괄" />
        </div>
      </Modal>

      {/* 전송그룹 편집 */}
      <Modal open={groupEdit !== null} onClose={() => setGroupEdit(null)} title={groupEdit === "new" ? "전송그룹 만들기" : "전송그룹 편집"} size="lg" description="상황전파 발송 시 한 번에 선택되는 수신자 묶음입니다. 조직도에서 부서·실무반 단위로 체크하거나 검색해 담으세요."
        footer={<><Button variant="ghost" onClick={() => setGroupEdit(null)}>취소</Button><Button leftIcon={<IconCheckCircle size={16} />} onClick={saveGroup}>{groupEdit === "new" ? "등록" : "저장"} ({gMembers.size}명)</Button></>}>
        <div className="grid md:grid-cols-[280px_1fr] gap-[16rem]">
          <div className="space-y-[12rem]">
            <TextInput label="그룹 이름 *" value={gName} onChange={(e) => setGName(e.target.value)} placeholder="예) 13개 협업기능반 반장" />
            <TextInput label="설명" value={gDesc} onChange={(e) => setGDesc(e.target.value)} placeholder="예) 비상소집 SMS 대상" />
            <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[10rem] typo-body-sm text-[var(--color-text-tertiary)] leading-relaxed">매뉴얼 예시: 「13개 협업기능별 실무반·유관기관 SMS 문자 발송」(8-5 재대본 운영강화), 「비상근무조 SMS 비상응소명령」(8-6)</div>
          </div>
          <div className="min-h-[360px] flex flex-col"><ContactPicker selected={gMembers} onChange={setGMembers} showGroups={false} /></div>
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="연락처 삭제" intent="error" size="sm" description={`선택한 ${sel.size}명을 삭제합니다. 전송그룹에서도 제외됩니다.`}
        footer={<><Button variant="ghost" onClick={() => setDelOpen(false)}>취소</Button><Button variant="danger" leftIcon={<IconTrash size={16} />} onClick={() => { const ids = Array.from(sel); deleteContacts(ids); groups.forEach((g) => { if (g.memberIds.some((m) => ids.includes(m))) updateGroup(g.id, { memberIds: g.memberIds.filter((m) => !ids.includes(m)) }); }); setSel(new Set()); setDelOpen(false); toast.success("삭제했습니다"); }}>삭제</Button></>}>
        <div className="typo-body-sm text-[var(--color-text-tertiary)] max-h-[160px] overflow-y-auto">{contacts.filter((c) => sel.has(c.id)).map((c) => `${c.dept} ${c.name}`).join(", ")}</div>
      </Modal>

      {/* 업로드 미리보기 */}
      <Modal open={!!parsed} onClose={() => setParsed(null)} title="엑셀 일괄 업로드 미리보기" size="xl"
        description={parsed ? `${parsed.fileName} · 시트 「${parsed.sheet}」 · ${parsed.rows.length}행 인식 · 가져오기 가능 ${okRows}행${errRows ? ` · 오류 ${errRows}행 제외` : ""}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setParsed(null)}>취소</Button><Button leftIcon={<IconUpload size={16} />} disabled={okRows === 0 || (parsed?.missing.length ?? 0) > 0} onClick={applyImport}>{okRows}명 가져오기</Button></>}>
        {parsed && (
          <div className="space-y-[12rem]">
            {parsed.missing.length > 0 && <div className="rounded-lg bg-[var(--color-surface-error-subtle)] text-[var(--color-text-error)] p-[10rem] typo-body-sm flex items-center gap-[6rem]"><IconWarning size={16} /> 필수 컬럼을 찾지 못했습니다: {parsed.missing.join(", ")} — 양식의 1행 헤더를 확인하세요.</div>}
            <div className="flex items-center gap-[12rem] flex-wrap">
              <span className="typo-body-sm font-medium text-[var(--color-text-secondary)]">가져오기 방식</span>
              <SegmentedControl value={mode} setValue={setMode} size="sm" fitContent options={[{ value: "append", label: "추가" }, { value: "merge", label: "병합(중복 갱신)" }, { value: "replace", label: `전체 교체 (기존 ${contacts.length}명 삭제)` }]} />
              <span className="ml-auto typo-body-sm text-[var(--color-text-tertiary)] truncate max-w-[420rem]">인식된 헤더: {Object.entries(parsed.headerMap).map(([k, v]) => (k === v ? k : `${k}←${v}`)).join(" · ")}</span>
            </div>
            <div className="overflow-auto max-h-[52vh] border border-[var(--color-border-subtle)] rounded-lg">
              <table className="w-full min-w-[900px] typo-body-sm">
                <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)] sticky top-0">
                  <tr><Th>행</Th><Th>상태</Th><Th>구분</Th><Th>실무반/기관</Th><Th>부서명</Th><Th>직위</Th><Th>이름</Th><Th>전화번호</Th><Th>이메일</Th><Th>비고</Th></tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r) => (
                    <tr key={r.row} className={cn("border-t border-[var(--color-border-subtle)]", r.errors.length && "bg-[var(--color-surface-error-subtle)]/50")}>
                      <Td className="font-mono text-[var(--color-text-helper)]">{r.row}</Td>
                      <Td>{r.errors.length ? <DsBadge label={r.errors.join(", ")} color="error" variant="solid-pastel" size="xs" /> : r.warnings.length ? <DsBadge label={r.warnings.join(", ")} color="light-warning" variant="solid-pastel" size="xs" /> : <DsBadge label="정상" color="success" variant="solid-pastel" size="xs" />}</Td>
                      <Td>{ORG_SHORT[r.data.orgType]}</Td><Td>{r.data.unit}</Td><Td>{r.data.dept}</Td><Td>{r.data.position}</Td><Td className="font-medium text-[var(--color-text-primary)]">{r.data.name}</Td><Td className="font-mono">{r.data.phone}</Td><Td>{r.data.email}</Td><Td className="text-[var(--color-text-tertiary)]">{r.data.note}</Td>
                    </tr>
                  ))}
                  {parsed.rows.length === 0 && <tr><td colSpan={10} className="px-[16rem] py-[24rem] text-center text-[var(--color-text-tertiary)]">데이터 행이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Summary({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card p-[16rem] flex items-center gap-[12rem]">
      <span className="size-[40rem] rounded-xl grid place-items-center bg-[var(--color-surface-brand-subtle)] text-[var(--color-icon-brand)] shrink-0">{icon}</span>
      <div className="min-w-0"><div className="typo-body-sm text-[var(--color-text-tertiary)]">{label}</div><div className="typo-title-sm font-bold text-[var(--color-text-primary)] leading-tight truncate">{value}</div>{sub && <div className="typo-body-sm text-[var(--color-text-helper)] truncate">{sub}</div>}</div>
    </div>
  );
}
function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left font-medium px-[12rem] py-[10rem] whitespace-nowrap">{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-[12rem] py-[8rem] text-[var(--color-text-basic)] align-middle", className)}>{children}</td>;
}
function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[12rem]">
      <div className="label">{k}</div>
      <div className="typo-body-sm text-[var(--color-text-basic)] mt-[2rem] leading-relaxed">{v}</div>
    </div>
  );
}

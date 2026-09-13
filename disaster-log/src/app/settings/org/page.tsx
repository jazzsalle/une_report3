"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  설정 › 조직·연락처 관리 — 상황전파 수신대상 (부서명·직위·이름·전화번호·이메일)
//  · 개별 등록/수정/삭제 · 엑셀 양식 다운로드 · 엑셀 일괄 업로드(미리보기·검증) · 내보내기
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge as DsBadge, Checkbox as DsCheckbox, ChoiceChip, IconButton, SegmentedControl } from "@une-front/react-ui";
import { useHydrated } from "@/lib/useHydrated";
import { useAppStore } from "@/store/useAppStore";
import { Button, Card, EmptyState, Help, Modal, PageHeader, TextInput, useToast } from "@/components/ui";
import { IconDownload, IconUpload, IconPlus, IconEdit, IconTrash, IconSearch, IconPerson, IconMail, IconPhone, IconChevronLeft, IconCheckCircle, IconWarning } from "@/components/icons";
import { buildExportWorkbook, buildTemplateWorkbook, isValidEmail, normalizePhone, parseContactsFile, XLSX_MIME, type ParseResult } from "@/lib/org/excel";
import { SEED_CONTACTS } from "@/lib/seed/contacts";
import type { Contact, ContactInput } from "@/lib/types";
import { cn, downloadBlob, fmtDateTime } from "@/lib/utils";

const EMPTY: ContactInput = { dept: "", position: "", name: "", phone: "", email: "", note: "" };

export default function OrgPage() {
  const toast = useToast();
  const hydrated = useHydrated();
  const contacts = useAppStore((s) => s.contacts);
  const addContact = useAppStore((s) => s.addContact);
  const updateContact = useAppStore((s) => s.updateContact);
  const deleteContacts = useAppStore((s) => s.deleteContacts);
  const importContacts = useAppStore((s) => s.importContacts);

  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [form, setForm] = useState<ContactInput>(EMPTY);
  const [delOpen, setDelOpen] = useState(false);
  const [parsed, setParsed] = useState<(ParseResult & { fileName: string }) | null>(null);
  const [mode, setMode] = useState<"append" | "merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const depts = useMemo(() => Array.from(new Set(contacts.map((c) => c.dept))).sort((a, b) => a.localeCompare(b, "ko")), [contacts]);
  const visible = useMemo(() => contacts.filter((c) => (!dept || c.dept === dept) && (!q || `${c.dept} ${c.position} ${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.dept.localeCompare(b.dept, "ko") || a.name.localeCompare(b.name, "ko")), [contacts, dept, q]);
  const allVisibleSel = visible.length > 0 && visible.every((c) => sel.has(c.id));

  const openNew = () => { setForm({ ...EMPTY, dept: dept ?? "" }); setEditing("new"); };
  const openEdit = (c: Contact) => { setForm({ dept: c.dept, position: c.position, name: c.name, phone: c.phone, email: c.email ?? "", note: c.note ?? "" }); setEditing(c); };
  const save = () => {
    const data: ContactInput = { ...form, phone: normalizePhone(form.phone), email: form.email?.trim() || undefined, note: form.note?.trim() || undefined };
    if (!data.dept.trim() || !data.name.trim() || !data.phone) return toast.error("부서명·이름·전화번호는 필수입니다");
    if (!isValidEmail(data.email ?? "")) return toast.error("이메일 형식을 확인하세요");
    if (editing === "new") { addContact(data); toast.success("연락처를 등록했습니다"); }
    else if (editing) { updateContact(editing.id, data); toast.success("수정했습니다"); }
    setEditing(null);
  };
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAllVisible = () => setSel((p) => { const n = new Set(p); if (allVisibleSel) visible.forEach((c) => n.delete(c.id)); else visible.forEach((c) => n.add(c.id)); return n; });

  const downloadTemplate = () => { downloadBlob(new Blob([buildTemplateWorkbook()], { type: XLSX_MIME }), "조직연락처_업로드양식.xlsx"); toast.success("업로드 양식을 다운로드했습니다"); };
  const exportAll = () => { downloadBlob(new Blob([buildExportWorkbook(contacts)], { type: XLSX_MIME }), `조직연락처_${new Date().toISOString().slice(0, 10)}.xlsx`); };
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
  const loadSeed = () => { const { added, updated } = importContacts(SEED_CONTACTS, "merge"); toast.success(`기본 연락처 ${added + updated}명을 불러왔습니다`); };

  if (!hydrated) return <div className="p-[32rem] typo-body-md text-[var(--color-text-tertiary)]">불러오는 중…</div>;

  const okRows = parsed?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const errRows = (parsed?.rows.length ?? 0) - okRows;

  return (
    <div className="p-[24rem] md:p-[32rem] max-w-[1200px] mx-auto space-y-[20rem]">
      <div className="flex items-start gap-[12rem]">
        <Link href="/settings" className="size-[36rem] grid place-items-center rounded-lg border border-[var(--color-border-default)] hover:bg-[var(--color-surface-subtle)] shrink-0 text-[var(--color-icon-secondary)] mt-[6rem]"><IconChevronLeft size={16} /></Link>
        <div className="flex-1">
          <PageHeader
            eyebrow="설정"
            title={<span className="inline-flex items-center gap-[8rem]">조직·연락처 관리 <Help size="lg" title="조직·연락처는 어디에 쓰이나요?" text={"SOP 실행 중 「상황전파 SMS 발송」에서 수신대상을 부서·이름으로 골라 넣을 때 사용합니다.\n\n엑셀 양식을 내려받아 부서명·직위·이름·전화번호·이메일을 채운 뒤 일괄 업로드하면 됩니다. 저장은 이 브라우저(localStorage)에만 되며 외부로 전송되지 않습니다."} /></span>}
            desc="상황전파 수신대상으로 쓰이는 부서·담당자 연락망입니다. 엑셀 양식으로 일괄 업로드하거나 개별 등록합니다."
            right={
              <div className="flex gap-[8rem] flex-wrap">
                <Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={downloadTemplate}>엑셀 양식 다운로드</Button>
                <Button variant="outline" leftIcon={<IconUpload size={16} />} loading={busy} onClick={() => fileRef.current?.click()}>엑셀 일괄 업로드</Button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                <Button leftIcon={<IconPlus size={16} />} onClick={openNew}>개별 등록</Button>
              </div>
            }
          />
        </div>
      </div>

      {/* 요약 */}
      <div className="grid sm:grid-cols-3 gap-[12rem]">
        <Summary icon={<IconPerson size={20} />} label="등록 인원" value={`${contacts.length}명`} />
        <Summary icon={<IconPhone size={20} />} label="부서 수" value={`${depts.length}개`} />
        <Summary icon={<IconMail size={20} />} label="이메일 보유" value={`${contacts.filter((c) => c.email).length}명`} />
      </div>

      <Card padded={false}
        title="연락처 목록"
        subtitle={`${visible.length}명 표시${sel.size ? ` · ${sel.size}명 선택` : ""}`}
        right={
          <div className="flex items-center gap-[8rem] flex-wrap justify-end">
            <div className="relative">
              <IconSearch size={16} className="absolute left-[10rem] top-1/2 -translate-y-1/2 text-[var(--color-icon-tertiary)]" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·부서·직위·전화 검색" className="h-[32rem] w-[240rem] pl-[32rem] pr-[10rem] rounded-lg border border-[var(--color-border-default)] typo-body-sm bg-[var(--color-surface-primary)] outline-none focus:border-[var(--color-border-brand)]" />
            </div>
            {sel.size > 0 && <Button size="sm" variant="danger" leftIcon={<IconTrash size={16} />} onClick={() => setDelOpen(true)}>선택 삭제 ({sel.size})</Button>}
            {contacts.length > 0 && <Button size="sm" variant="outline" leftIcon={<IconDownload size={16} />} onClick={exportAll}>내보내기(xlsx)</Button>}
          </div>
        }
      >
        {depts.length > 0 && (
          <div className="px-[20rem] pb-[12rem] flex gap-[6rem] flex-wrap">
            <ChoiceChip label={`전체 ${contacts.length}`} size="sm" variant="outline" selected={!dept} onClick={() => setDept(null)} />
            {depts.map((d) => <ChoiceChip key={d} label={`${d} ${contacts.filter((c) => c.dept === d).length}`} size="sm" variant="outline" selected={dept === d} onClick={() => setDept(dept === d ? null : d)} />)}
          </div>
        )}
        {contacts.length === 0 ? (
          <div className="p-[24rem]">
            <EmptyState icon={<IconPerson size={28} />} title="등록된 연락처가 없습니다" desc="엑셀 양식을 내려받아 채운 뒤 일괄 업로드하거나, 개별 등록으로 시작하세요. 시연용 기본 연락처(가상 인물 14명)를 불러올 수도 있습니다."
              action={<div className="flex gap-[8rem] flex-wrap justify-center"><Button variant="outline" leftIcon={<IconDownload size={16} />} onClick={downloadTemplate}>엑셀 양식 다운로드</Button><Button variant="outline" leftIcon={<IconUpload size={16} />} onClick={() => fileRef.current?.click()}>엑셀 일괄 업로드</Button><Button onClick={loadSeed}>기본 연락처 불러오기</Button></div>} />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-[var(--color-border-subtle)]">
            <table className="w-full min-w-[820px] typo-body-sm">
              <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]">
                <tr>
                  <th className="w-[44rem] px-[16rem] py-[10rem]"><DsCheckbox checked={allVisibleSel} onCheckedChange={toggleAllVisible} size="sm" aria-label="전체 선택" /></th>
                  <Th>부서명</Th><Th>직위</Th><Th>이름</Th><Th>전화번호</Th><Th>이메일</Th><Th>비고</Th><Th>수정</Th><th className="w-[72rem]" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className={cn("border-t border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-subtle)]", sel.has(c.id) && "bg-[var(--color-surface-brand-subtle)]")}>
                    <td className="px-[16rem] py-[8rem]"><DsCheckbox checked={sel.has(c.id)} onCheckedChange={() => toggleSel(c.id)} size="sm" aria-label={`${c.name} 선택`} /></td>
                    <Td className="font-medium text-[var(--color-text-primary)]">{c.dept}</Td>
                    <Td>{c.position || <span className="text-[var(--color-text-helper)]">-</span>}</Td>
                    <Td className="font-medium text-[var(--color-text-primary)]">{c.name}</Td>
                    <Td className="font-mono">{c.phone}</Td>
                    <Td>{c.email ? <a href={`mailto:${c.email}`} className="text-[var(--color-text-brand)] hover:underline">{c.email}</a> : <span className="text-[var(--color-text-helper)]">-</span>}</Td>
                    <Td className="text-[var(--color-text-tertiary)] max-w-[220rem] truncate">{c.note ?? ""}</Td>
                    <Td className="text-[var(--color-text-helper)] whitespace-nowrap">{fmtDateTime(c.updatedAt)}</Td>
                    <td className="px-[8rem] py-[6rem] whitespace-nowrap">
                      <IconButton icon={<IconEdit size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="수정" onClick={() => openEdit(c)} />
                      <IconButton icon={<IconTrash size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="삭제" onClick={() => { setSel(new Set([c.id])); setDelOpen(true); }} />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={9} className="px-[16rem] py-[24rem] text-center text-[var(--color-text-tertiary)]">검색 결과가 없습니다</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="일괄 업로드 안내" subtitle="양식의 1행 헤더는 유지하고 예시 행은 지운 뒤 업로드하세요. 헤더 표기가 달라도(부서/소속, 직급, 성명, 연락처/휴대폰 등) 자동 인식합니다.">
        <div className="grid md:grid-cols-3 gap-[8rem]">
          <Info k="① 양식 다운로드" v="「연락처」 시트에 부서명·직위·이름·전화번호·이메일·비고 6개 컬럼. 「작성안내」 시트 참고" />
          <Info k="② 작성 후 업로드" v=".xlsx / .xls / .csv 지원. 업로드 전 미리보기에서 오류 행(이름·부서·전화 누락)을 확인하고 제외" />
          <Info k="③ 가져오기 방식" v="추가 · 병합(전화번호 또는 부서+이름이 같으면 갱신) · 전체 교체 중 선택" />
        </div>
      </Card>

      {/* 등록/수정 모달 */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "연락처 등록" : "연락처 수정"} size="md"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>취소</Button><Button leftIcon={<IconCheckCircle size={16} />} onClick={save}>{editing === "new" ? "등록" : "저장"}</Button></>}>
        <div className="grid md:grid-cols-2 gap-[12rem]">
          <TextInput label="부서명 *" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} placeholder="재난안전상황실" list="dept-list" />
          <datalist id="dept-list">{depts.map((d) => <option key={d} value={d} />)}</datalist>
          <TextInput label="직위" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="팀장" />
          <TextInput label="이름 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
          <TextInput label="전화번호 *" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => setForm((f) => ({ ...f, phone: normalizePhone(f.phone) }))} placeholder="010-0000-0000" />
          <TextInput label="이메일" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.go.kr" />
          <TextInput label="비고" value={form.note ?? ""} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="야간 당직 총괄" />
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="연락처 삭제" intent="error" size="sm" description={`선택한 ${sel.size}명을 삭제합니다. 되돌릴 수 없습니다.`}
        footer={<><Button variant="ghost" onClick={() => setDelOpen(false)}>취소</Button><Button variant="danger" leftIcon={<IconTrash size={16} />} onClick={() => { deleteContacts(Array.from(sel)); setSel(new Set()); setDelOpen(false); toast.success("삭제했습니다"); }}>삭제</Button></>}>
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
              <span className="ml-auto typo-body-sm text-[var(--color-text-tertiary)]">인식된 헤더: {Object.entries(parsed.headerMap).map(([k, v]) => (k === v ? k : `${k}←${v}`)).join(" · ")}</span>
            </div>
            <div className="overflow-auto max-h-[52vh] border border-[var(--color-border-subtle)] rounded-lg">
              <table className="w-full min-w-[760px] typo-body-sm">
                <thead className="bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)] sticky top-0">
                  <tr><Th>행</Th><Th>상태</Th><Th>부서명</Th><Th>직위</Th><Th>이름</Th><Th>전화번호</Th><Th>이메일</Th><Th>비고</Th></tr>
                </thead>
                <tbody>
                  {parsed.rows.map((r) => (
                    <tr key={r.row} className={cn("border-t border-[var(--color-border-subtle)]", r.errors.length && "bg-[var(--color-surface-error-subtle)]/50")}>
                      <Td className="font-mono text-[var(--color-text-helper)]">{r.row}</Td>
                      <Td>
                        {r.errors.length ? <DsBadge label={r.errors.join(", ")} color="error" variant="solid-pastel" size="xs" /> : r.warnings.length ? <DsBadge label={r.warnings.join(", ")} color="light-warning" variant="solid-pastel" size="xs" /> : <DsBadge label="정상" color="success" variant="solid-pastel" size="xs" />}
                      </Td>
                      <Td>{r.data.dept}</Td><Td>{r.data.position}</Td><Td className="font-medium text-[var(--color-text-primary)]">{r.data.name}</Td><Td className="font-mono">{r.data.phone}</Td><Td>{r.data.email}</Td><Td className="text-[var(--color-text-tertiary)]">{r.data.note}</Td>
                    </tr>
                  ))}
                  {parsed.rows.length === 0 && <tr><td colSpan={8} className="px-[16rem] py-[24rem] text-center text-[var(--color-text-tertiary)]">데이터 행이 없습니다</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-[16rem] flex items-center gap-[12rem]">
      <span className="size-[40rem] rounded-xl grid place-items-center bg-[var(--color-surface-brand-subtle)] text-[var(--color-icon-brand)] shrink-0">{icon}</span>
      <div><div className="typo-body-sm text-[var(--color-text-tertiary)]">{label}</div><div className="typo-title-sm font-bold text-[var(--color-text-primary)] leading-tight">{value}</div></div>
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

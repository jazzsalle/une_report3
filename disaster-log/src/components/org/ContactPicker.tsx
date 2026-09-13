"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  연락처 선택기 — 조직도(구분 → 실무반·기관 → 부서 → 사람) · 전송그룹 · 검색 · (조치 역할 기반) 추천
//  상황전파 발송 모달과 전송그룹 편집에서 공용으로 사용
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { Checkbox as DsCheckbox, ChoiceChip, Badge as DsBadge } from "@une-front/react-ui";
import { useAppStore } from "@/store/useAppStore";
import type { Contact, OrgType } from "@/lib/types";
import { ORG_TYPE_LABEL } from "@/lib/types";
import { IconChevronDown, IconChevronRight, IconSearch, IconPerson } from "@/components/icons";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import Link from "next/link";

export interface RoleHint {
  lead?: string; // 주관부서
  support?: string; // 지원부서
  coop?: string; // 협업기관
}

const ORG_ORDER: OrgType[] = ["command", "team", "agency"];
const ORG_TONE: Record<OrgType, string> = { command: "bg-[var(--red-25)] text-[var(--red-600)]", team: "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]", agency: "bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]" };

/** 역할 문자열("자연재난과, 재난안전상황실")과 연락처 부서/기관 매칭 */
function matchRole(role: string | undefined, c: Contact) {
  if (!role) return false;
  return role
    .split(/[,·/]/)
    .map((x) => x.trim().replace(/\(.*?\)/g, ""))
    .filter(Boolean)
    .some((r) => (r.length >= 2 && (c.dept.includes(r) || c.unit.includes(r) || r.includes(c.dept))) );
}

export function ContactPicker({ selected, onChange, hint, showGroups = true, compact, onGroupPicked }: { selected: Set<string>; onChange: (next: Set<string>) => void; hint?: RoleHint; showGroups?: boolean; compact?: boolean; onGroupPicked?: (name: string) => void }) {
  const contacts = useAppStore((s) => s.contacts);
  const groups = useAppStore((s) => s.groups);
  const [tab, setTab] = useState<"suggest" | "tree" | "groups" | "search">(hint && (hint.lead || hint.support || hint.coop) ? "suggest" : "tree");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const tree = useMemo(() => {
    const byType = new Map<OrgType, Map<string, Map<string, Contact[]>>>();
    for (const c of contacts) {
      const t = byType.get(c.orgType) ?? new Map<string, Map<string, Contact[]>>();
      const u = t.get(c.unit) ?? new Map<string, Contact[]>();
      const d = u.get(c.dept) ?? [];
      d.push(c);
      u.set(c.dept, d);
      t.set(c.unit, u);
      byType.set(c.orgType, t);
    }
    return byType;
  }, [contacts]);

  const suggestions = useMemo(() => {
    if (!hint) return [] as { role: string; items: Contact[] }[];
    const out: { role: string; items: Contact[] }[] = [];
    const lead = contacts.filter((c) => matchRole(hint.lead, c));
    const support = contacts.filter((c) => matchRole(hint.support, c) && !lead.includes(c));
    const coop = contacts.filter((c) => matchRole(hint.coop, c) && !lead.includes(c) && !support.includes(c));
    if (hint.lead) out.push({ role: `주관부서 · ${hint.lead}`, items: lead });
    if (hint.support) out.push({ role: `지원부서 · ${hint.support}`, items: support });
    if (hint.coop) out.push({ role: `협업기관 · ${hint.coop}`, items: coop });
    return out;
  }, [contacts, hint]);

  const found = useMemo(() => (q ? contacts.filter((c) => `${c.unit} ${c.dept} ${c.position} ${c.name} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase())) : []), [contacts, q]);

  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  };
  const toggleMany = (ids: string[], on: boolean) => {
    const n = new Set(selected);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    onChange(n);
  };
  const allOn = (ids: string[]) => ids.length > 0 && ids.every((id) => selected.has(id));

  if (contacts.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border-default)] p-[16rem] typo-body-sm text-[var(--color-text-tertiary)] leading-relaxed">
        등록된 연락처가 없습니다. <Link href="/settings/org" className="text-[var(--color-text-brand)] underline">설정 › 조직·연락처 관리</Link>에서 기본 연락처를 불러오거나 엑셀로 일괄 업로드하세요.
      </div>
    );

  const Person = ({ c }: { c: Contact }) => (
    <label className={cn("flex items-start gap-[8rem] px-[10rem] py-[6rem] rounded-lg cursor-pointer hover:bg-[var(--color-surface-subtle)]", selected.has(c.id) && "bg-[var(--color-surface-brand-subtle)]")}>
      <DsCheckbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} size="sm" className="mt-[1px]" />
      <span className="min-w-0 flex-1">
        <span className="typo-body-sm font-medium text-[var(--color-text-primary)]">{c.name} <span className="font-normal text-[var(--color-text-tertiary)]">{c.position}</span></span>
        <span className="block typo-body-sm text-[var(--color-text-tertiary)] truncate">{c.dept} · {c.phone}{c.email ? ` · ${c.email}` : ""}</span>
      </span>
    </label>
  );

  return (
    <div className={cn("flex flex-col min-h-0", compact ? "" : "h-full")}>
      <div className="flex items-center gap-[4rem] flex-wrap mb-[8rem]">
        {hint && (hint.lead || hint.support || hint.coop) && <ChoiceChip label="조치 담당 추천" size="sm" variant="outline" selected={tab === "suggest"} onClick={() => setTab("suggest")} />}
        <ChoiceChip label="조직도" size="sm" variant="outline" selected={tab === "tree"} onClick={() => setTab("tree")} />
        {showGroups && <ChoiceChip label={`전송그룹 ${groups.length}`} size="sm" variant="outline" selected={tab === "groups"} onClick={() => setTab("groups")} />}
        <ChoiceChip label="검색" size="sm" variant="outline" selected={tab === "search"} onClick={() => setTab("search")} />
        <span className="ml-auto typo-body-sm text-[var(--color-text-tertiary)]">{selected.size}명 선택</span>
      </div>

      <div className={cn("flex-1 min-h-0 overflow-y-auto rounded-xl border border-[var(--color-border-subtle)]", compact ? "max-h-[360px]" : "")}>
        {tab === "suggest" && (
          <div className="p-[8rem] space-y-[10rem]">
            {suggestions.map((sg) => (
              <div key={sg.role}>
                <div className="flex items-center gap-[8rem] px-[6rem] py-[4rem]">
                  <span className="typo-body-sm font-medium text-[var(--color-text-secondary)]">{sg.role}</span>
                  <span className="typo-body-sm text-[var(--color-text-helper)]">{sg.items.length}명</span>
                  {sg.items.length > 0 && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => toggleMany(sg.items.map((c) => c.id), !allOn(sg.items.map((c) => c.id)))}>{allOn(sg.items.map((c) => c.id)) ? "선택 해제" : "모두 선택"}</Button>}
                </div>
                {sg.items.length === 0 ? <div className="px-[10rem] py-[4rem] typo-body-sm text-[var(--color-text-helper)]">일치하는 연락처 없음 — 조직도에서 직접 선택</div> : sg.items.map((c) => <Person key={c.id} c={c} />)}
              </div>
            ))}
          </div>
        )}

        {tab === "tree" && (
          <div className="p-[6rem]">
            {ORG_ORDER.filter((t) => tree.has(t)).map((t) => {
              const units = tree.get(t)!;
              const typeIds = Array.from(units.values()).flatMap((u) => Array.from(u.values()).flat()).map((c) => c.id);
              return (
                <div key={t} className="mb-[6rem]">
                  <div className="flex items-center gap-[8rem] px-[8rem] py-[6rem] rounded-lg bg-[var(--color-surface-subtle)]">
                    <span className={cn("rounded-sm px-[6rem] h-[20rem] inline-flex items-center typo-body-sm font-medium", ORG_TONE[t])}>{ORG_TYPE_LABEL[t]}</span>
                    <span className="typo-body-sm text-[var(--color-text-tertiary)]">{units.size}개 · {typeIds.length}명</span>
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => toggleMany(typeIds, !allOn(typeIds))}>{allOn(typeIds) ? "해제" : "전체"}</Button>
                  </div>
                  {Array.from(units.entries()).map(([unit, depts]) => {
                    const key = `${t}|${unit}`;
                    const unitIds = Array.from(depts.values()).flat().map((c) => c.id);
                    const isOpen = open[key] ?? (t !== "team" || units.size <= 3);
                    return (
                      <div key={unit} className="ml-[6rem] border-l border-[var(--color-border-subtle)] pl-[6rem] mt-[4rem]">
                        <div className="flex items-center gap-[6rem] px-[4rem] py-[4rem]">
                          <button onClick={() => setOpen({ ...open, [key]: !isOpen })} className="inline-grid place-items-center size-[20rem] rounded-sm text-[var(--color-icon-tertiary)] hover:bg-[var(--color-surface-subtle)]">{isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}</button>
                          <DsCheckbox checked={allOn(unitIds)} onCheckedChange={(v) => toggleMany(unitIds, !!v)} size="sm" />
                          <button onClick={() => setOpen({ ...open, [key]: !isOpen })} className="typo-body-sm font-medium text-[var(--color-text-primary)] text-left flex-1 truncate">{unit}</button>
                          <span className="typo-body-sm text-[var(--color-text-helper)]">{unitIds.filter((id) => selected.has(id)).length}/{unitIds.length}</span>
                        </div>
                        {isOpen &&
                          Array.from(depts.entries()).map(([dept, people]) => {
                            const ids = people.map((c) => c.id);
                            return (
                              <div key={dept} className="ml-[26rem] mb-[4rem]">
                                <div className="flex items-center gap-[6rem] px-[4rem] py-[2rem]">
                                  <DsCheckbox checked={allOn(ids)} onCheckedChange={(v) => toggleMany(ids, !!v)} size="sm" />
                                  <span className="typo-body-sm text-[var(--color-text-secondary)] truncate">{dept}</span>
                                  <span className="typo-body-sm text-[var(--color-text-helper)]">{people.length}</span>
                                </div>
                                <div className="ml-[18rem]">{people.map((c) => <Person key={c.id} c={c} />)}</div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {tab === "groups" && (
          <div className="p-[8rem] space-y-[6rem]">
            {groups.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)] p-[8rem]">전송그룹이 없습니다. <Link href="/settings/org?tab=groups" className="text-[var(--color-text-brand)] underline">조직·연락처 관리 › 전송그룹</Link>에서 만들 수 있습니다.</div>}
            {groups.map((g) => {
              const ids = g.memberIds.filter((id) => contacts.some((c) => c.id === id));
              const on = allOn(ids);
              return (
                <div key={g.id} className={cn("rounded-xl border p-[10rem] flex items-center gap-[10rem]", on ? "border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)]" : "border-[var(--color-border-subtle)]")}>
                  <span className="inline-grid place-items-center size-[32rem] rounded-lg bg-[var(--color-surface-subtle)] text-[var(--color-icon-secondary)]"><IconPerson size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="typo-body-md font-medium text-[var(--color-text-primary)] truncate">{g.name} <DsBadge label={`${ids.length}명`} color="grayscale" variant="solid-pastel" size="xs" /></div>
                    {g.description && <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{g.description}</div>}
                  </div>
                  <Button size="xs" variant={on ? "outline" : "primary"} onClick={() => { toggleMany(ids, !on); if (!on) onGroupPicked?.(g.name); }}>{on ? "그룹 해제" : "그룹 선택"}</Button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "search" && (
          <div className="p-[8rem]">
            <div className="relative mb-[6rem]">
              <IconSearch size={16} className="absolute left-[10rem] top-1/2 -translate-y-1/2 text-[var(--color-icon-tertiary)]" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·직위·부서·실무반·전화 검색" className="h-[32rem] w-full pl-[32rem] pr-[10rem] rounded-lg border border-[var(--color-border-default)] typo-body-sm bg-[var(--color-surface-primary)] outline-none focus:border-[var(--color-border-brand)]" />
            </div>
            {q && found.length === 0 && <div className="typo-body-sm text-[var(--color-text-tertiary)] p-[8rem]">검색 결과 없음</div>}
            {found.slice(0, 80).map((c) => <Person key={c.id} c={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 선택된 연락처 칩 목록 */
export function SelectedChips({ selected, onRemove, max = 12 }: { selected: Set<string>; onRemove: (id: string) => void; max?: number }) {
  const contacts = useAppStore((s) => s.contacts);
  const list = contacts.filter((c) => selected.has(c.id));
  if (!list.length) return <div className="typo-body-sm text-[var(--color-text-helper)]">선택된 수신자가 없습니다</div>;
  return (
    <div className="flex flex-wrap gap-[4rem]">
      {list.slice(0, max).map((c) => (
        <span key={c.id} className="inline-flex items-center gap-[4rem] h-[24rem] pl-[8rem] pr-[4rem] rounded-sm bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)] typo-body-sm">
          {c.name} {c.position}
          <button onClick={() => onRemove(c.id)} className="size-[16rem] grid place-items-center rounded-max hover:bg-white/60" aria-label="제외">×</button>
        </span>
      ))}
      {list.length > max && <span className="typo-body-sm text-[var(--color-text-tertiary)] self-center">외 {list.length - max}명</span>}
    </div>
  );
}

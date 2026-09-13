"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  상황전파 발송 모달 — 채널(SMS·이메일) · 수신자(사람/그룹/조치 담당 추천) · 제목/내용 · 모바일 미리보기
//  발송 후: 수신자별 모바일 링크 + QR (휴대폰으로 열어 수신확인·임무완료 → 상황실에 자동 반영)
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import QRCode from "qrcode";
import { Badge as DsBadge, Checkbox as DsCheckbox } from "@une-front/react-ui";
import type { Dispatch, DispatchChannel, DispatchPayload, Situation, SopNode } from "@/lib/types";
import { CHANNEL_LABEL } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { Button, Help, Modal, TextArea, TextInput, useToast } from "@/components/ui";
import { IconSend, IconCopy, IconMessage, IconMail, IconCheckCircle, IconClock, IconOpenNew } from "@/components/icons";
import { ContactPicker, SelectedChips } from "@/components/org/ContactPicker";
import { MobileDispatchView } from "@/components/dispatch/MobileDispatchView";
import { buildLink, smsText } from "@/lib/dispatch/payload";
import { cn, fmtTime } from "@/lib/utils";

const HELP_TEXT = "SMS·이메일에는 짧은 안내와 모바일 링크가 함께 발송됩니다(이번 범위는 모의 발송 · 링크와 QR 생성). 현장 요원이 링크를 열어 「수신확인 → 임무완료 → 조치사항(선택)」을 누르면 상황실 화면의 SOP 실행내역·타임라인·상황일지에 시각과 함께 자동 기록됩니다.\n\n수신자는 조직도(지휘부·실무반·유관기관)에서 사람 단위로, 또는 주소록의 전송그룹 단위로 고를 수 있고, 조치의 주관·지원·협업 부서 인원은 「조치 담당 추천」에 모아 보여 줍니다.";

export function DispatchModal({ open, onClose, s, node }: { open: boolean; onClose: () => void; s: Situation; node: SopNode }) {
  const toast = useToast();
  const st = useAppStore();
  const contacts = st.contacts;
  const spread = node.data.subMissions.find((m) => m.type === "spread");
  const [channels, setChannels] = useState<DispatchChannel[]>(node.data.channels?.length ? node.data.channels : ["sms"]);
  const [title, setTitle] = useState(`[${s.organization} 재대본] ${node.data.title}`);
  const [message, setMessage] = useState(spread?.spreadContent || `${node.data.title} 관련 상황을 전파합니다.\n${(node.data.details ?? []).slice(0, 3).map((d) => `· ${d}`).join("\n")}\n수신 즉시 확인 후 임무 완료 시 보고 바랍니다.`.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const [phase, setPhase] = useState<"compose" | "sent">("compose");
  const [sent, setSent] = useState<Dispatch | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const hint = useMemo(() => ({ lead: node.data.leadDept, support: node.data.supportDept, coop: node.data.coopAgencies }), [node.data.leadDept, node.data.supportDept, node.data.coopAgencies]);
  const nodeDispatches = (s.dispatches ?? []).filter((d) => d.nodeId === node.id);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const first = contacts.find((c) => selected.has(c.id));
  const previewPayload: DispatchPayload = useMemo(
    () => ({ v: 1, id: "preview", t: "preview", sid: s.id, org: s.organization, sit: s.title, level: s.alertLevel, node: node.data.title, title, msg: message, from: `${st.user.name} (${st.user.dept})`, at: new Date().toISOString(), to: first ? { name: first.name, position: first.position, dept: first.dept } : { name: "수신자", position: "", dept: "" }, ch: channels }),
    [s.id, s.organization, s.title, s.alertLevel, node.data.title, title, message, st.user.name, st.user.dept, first, channels],
  );

  const toggleChannel = (c: DispatchChannel) => setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const send = async () => {
    if (!channels.length) return toast.error("채널(SMS·이메일)을 하나 이상 선택하세요");
    if (!title.trim() || !message.trim()) return toast.error("제목과 내용을 입력하세요");
    const recips = contacts.filter((c) => selected.has(c.id));
    if (!recips.length) return toast.error("수신자를 선택하세요");
    if (channels.includes("email") && !channels.includes("sms") && recips.some((r) => !r.email)) toast.warning(`이메일이 없는 수신자 ${recips.filter((r) => !r.email).length}명은 전달되지 않습니다`);
    setBusy(true);
    try {
      const d = st.addDispatch(s.id, { nodeId: node.id, nodeTitle: node.data.title, channels, title: title.trim(), message: message.trim(), groupNames, recipients: recips.map((r) => ({ contactId: r.id, name: r.name, position: r.position, dept: r.dept, phone: r.phone, email: r.email })) });
      const payloads: DispatchPayload[] = d.recipients.map((r) => ({ v: 1, id: d.id, t: r.token, sid: s.id, org: s.organization, sit: s.title, level: s.alertLevel, node: node.data.title, title: d.title, msg: d.message, from: `${d.sentBy} (${st.user.dept})`, at: d.sentAt, to: { name: r.name, position: r.position, dept: r.dept }, ch: d.channels }));
      const lk: Record<string, string> = {};
      payloads.forEach((p) => (lk[p.t] = buildLink(origin, p)));
      setLinks(lk);
      // 서버 등록 (다른 기기에서 열 때 · 응답 폴링 대상) — 실패해도 링크 자체로 동작
      fetch("/api/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ situationId: s.id, payloads }) }).catch(() => {});
      const q: Record<string, string> = {};
      for (const p of payloads) q[p.t] = await QRCode.toDataURL(lk[p.t], { width: 176, margin: 1, color: { dark: "#111827", light: "#ffffff" } });
      setQrs(q);
      setSent(d);
      setPhase("sent");
      toast.success(`${recips.length}명에게 상황전파를 발송했습니다 (${channels.map((c) => CHANNEL_LABEL[c]).join("·")} · 모의)`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, label = "링크") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}를 복사했습니다`);
    } catch {
      toast.error("복사 실패 — 직접 선택해 복사하세요");
    }
  };

  // 열릴 때마다 RunTab 이 key 를 바꿔 재마운트하므로 별도 초기화 불필요

  return (
    <Modal open={open} onClose={onClose} size="xl" title={<span className="inline-flex items-center gap-[8rem]">상황전파 발송 <Help size="lg" title="상황전파 · 현장 응답" text={HELP_TEXT} direction="bottom" /></span>}
      description={phase === "compose" ? `조치 「${node.data.title}」 · UFR-006-001/002 · 수신자는 사용자가 확정합니다. 발송·응답 이력은 조치와 연결되어 상황일지·결과보고에 반영됩니다.` : `발송 완료 · ${sent?.recipients.length}명 · ${fmtTime(sent?.sentAt)} · 수신자별 링크·QR 로 모바일 응답 페이지를 열 수 있습니다`}
      footer={phase === "compose" ? (
        <><Button variant="ghost" onClick={onClose}>취소</Button><Button leftIcon={<IconSend size={16} />} loading={busy} onClick={send}>{selected.size ? `${selected.size}명에게 발송` : "발송"}</Button></>
      ) : (
        <><Button variant="ghost" onClick={() => { setPhase("compose"); setSent(null); }}>추가 발송</Button><Button onClick={onClose}>닫기</Button></>
      )}>
      {phase === "compose" ? (
        <div className="grid lg:grid-cols-[1fr_1fr_320px] gap-[16rem]">
          {/* 1. 채널 · 제목 · 내용 */}
          <div className="space-y-[12rem]">
            <div>
              <div className="label mb-[6rem]">전파 채널</div>
              <div className="flex gap-[8rem]">
                {(["sms", "email"] as DispatchChannel[]).map((c) => (
                  <button key={c} type="button" onClick={() => toggleChannel(c)} className={cn("flex-1 h-[40rem] rounded-lg border inline-flex items-center justify-center gap-[6rem] typo-body-md font-medium transition", channels.includes(c) ? "border-[var(--color-border-brand)] bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]" : "border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]")}>
                    {c === "sms" ? <IconMessage size={16} /> : <IconMail size={16} />} {CHANNEL_LABEL[c]}
                    {channels.includes(c) && <IconCheckCircle size={14} />}
                  </button>
                ))}
              </div>
              <div className="typo-body-sm text-[var(--color-text-helper)] mt-[4rem]">SOP 노드의 기본 채널을 따르며 발송 시 변경할 수 있습니다. 두 채널을 함께 보낼 수 있습니다.</div>
            </div>
            <TextInput label="제목" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextArea label="내용" minHeight={150} value={message} onChange={(e) => setMessage(e.target.value)} showCounter maxLength={2000} helperText="모바일 페이지 본문으로 표시됩니다. SMS 에는 앞 60자와 링크가 실립니다." />
            <div>
              <div className="label mb-[6rem]">수신자 ({selected.size}명){groupNames.length ? <span className="ml-[6rem] text-[var(--color-text-tertiary)] font-normal">그룹: {groupNames.join(", ")}</span> : null}</div>
              <SelectedChips selected={selected} onRemove={(id) => setSelected((p) => { const n = new Set(p); n.delete(id); return n; })} />
            </div>
            {nodeDispatches.length > 0 && (
              <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[10rem]">
                <div className="label mb-[4rem] flex items-center gap-[4rem]"><IconClock size={12} /> 이 조치의 발송 이력 ({nodeDispatches.length})</div>
                {nodeDispatches.map((d) => (
                  <div key={d.id} className="typo-body-sm text-[var(--color-text-basic)] py-[3rem] flex gap-[8rem]"><span className="font-mono text-[var(--color-text-tertiary)]">{fmtTime(d.sentAt)}</span><span className="flex-1 truncate">{d.title} → {d.recipients.length}명</span><span className="text-[var(--color-text-success)]">수신 {d.recipients.filter((r) => r.receivedAt).length} · 완료 {d.recipients.filter((r) => r.completedAt).length}</span></div>
                ))}
              </div>
            )}
          </div>
          {/* 2. 수신자 선택 */}
          <div className="min-h-[420px] flex flex-col">
            <div className="label mb-[6rem]">수신자 선택 — 사람 또는 그룹</div>
            <div className="flex-1 min-h-0"><ContactPicker selected={selected} onChange={setSelected} hint={hint} onGroupPicked={(name) => setGroupNames((g) => (g.includes(name) ? g : [...g, name]))} /></div>
          </div>
          {/* 3. 모바일 미리보기 */}
          <div>
            <div className="label mb-[6rem]">모바일 페이지 미리보기</div>
            <PhoneFrame><MobileDispatchView payload={previewPayload} state={{}} preview /></PhoneFrame>
            <div className="typo-body-sm text-[var(--color-text-helper)] mt-[6rem] leading-relaxed">현장 요원이 링크를 열면 이렇게 보입니다. 갤럭시·크롬 기준, iPhone·사파리 동일.</div>
          </div>
        </div>
      ) : sent ? (
        <div className="space-y-[14rem]">
          <div className="rounded-xl bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)] p-[12rem] typo-body-sm leading-relaxed flex gap-[8rem]">
            <IconCheckCircle size={16} className="mt-[2px] shrink-0" />
            <span>{sent.channels.map((c) => CHANNEL_LABEL[c]).join("·")} 모의 발송 완료. 실제 문자·메일 발송은 UNE SMS 모듈·메일 서버 연계 시 이 자리에서 이루어집니다. 아래 QR 을 휴대폰으로 스캔하거나 「모의 수신」으로 열어 응답을 눌러 보세요 — 이 화면의 타임라인에 바로 나타납니다.</span>
          </div>
          <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-[10rem]">
            {sent.recipients.map((r) => {
              const link = links[r.token] ?? "";
              const p: DispatchPayload = { v: 1, id: sent.id, t: r.token, sid: s.id, org: s.organization, sit: s.title, level: s.alertLevel, node: node.data.title, title: sent.title, msg: sent.message, from: sent.sentBy, at: sent.sentAt, to: { name: r.name, position: r.position, dept: r.dept }, ch: sent.channels };
              return (
                <div key={r.token} className="rounded-xl border border-[var(--color-border-subtle)] p-[10rem] flex gap-[10rem]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR */}
                  {qrs[r.token] ? <img src={qrs[r.token]} alt="QR" width={88} height={88} className="rounded-md border border-[var(--color-border-subtle)] shrink-0" /> : <div className="size-[88px] rounded-md bg-[var(--color-surface-subtle)]" />}
                  <div className="min-w-0 flex-1">
                    <div className="typo-body-md font-medium text-[var(--color-text-primary)] truncate">{r.name} <span className="typo-body-sm font-normal text-[var(--color-text-tertiary)]">{r.position}</span></div>
                    <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{r.dept}</div>
                    <div className="flex gap-[4rem] mt-[4rem] flex-wrap">
                      {sent.channels.includes("sms") && <DsBadge label={r.phone ? `SMS ${r.phone}` : "SMS 번호 없음"} color={r.phone ? "primary" : "error"} variant="solid-pastel" size="xs" />}
                      {sent.channels.includes("email") && <DsBadge label={r.email ? `메일 ${r.email}` : "메일 없음"} color={r.email ? "primary" : "error"} variant="solid-pastel" size="xs" />}
                    </div>
                    <div className="flex gap-[4rem] mt-[6rem] flex-wrap">
                      <Button size="xs" variant="outline" className="whitespace-nowrap" leftIcon={<IconCopy size={12} />} onClick={() => copy(link)}>링크 복사</Button>
                      <Button size="xs" variant="outline" className="whitespace-nowrap" leftIcon={<IconCopy size={12} />} onClick={() => copy(smsText(p, link), "SMS 문안")}>문안 복사</Button>
                      <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-[4rem] h-[24rem] px-[8rem] rounded-sm bg-[var(--color-surface-brand)] text-[var(--color-text-on-brand)] typo-body-sm font-medium whitespace-nowrap"><IconOpenNew size={12} /> 모의 수신</a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="rounded-xl bg-[var(--color-surface-subtle)] p-[10rem]">
            <div className="label mb-[4rem]">SMS 문안 예시 (첫 수신자)</div>
            <pre className="typo-body-sm whitespace-pre-wrap break-all text-[var(--color-text-basic)] font-sans">{smsText({ v: 1, id: sent.id, t: sent.recipients[0].token, sid: s.id, org: s.organization, sit: s.title, level: s.alertLevel, node: node.data.title, title: sent.title, msg: sent.message, from: sent.sentBy, at: sent.sentAt, to: { name: sent.recipients[0].name }, ch: sent.channels }, links[sent.recipients[0].token] ?? "")}</pre>
            <div className="typo-body-sm text-[var(--color-text-helper)] mt-[4rem]">실제 발송 시에는 URL 단축 서비스로 링크를 줄여 90자 SMS 에 맞춥니다.</div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

/** 휴대폰 프레임 — 미리보기용 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[300px] rounded-[28px] border-[6px] border-[#1f2937] bg-[#1f2937] shadow-[var(--elevation-03)] overflow-hidden">
      <div className="h-[18px] bg-[#1f2937] grid place-items-center"><span className="w-[60px] h-[5px] rounded-max bg-[#374151]" /></div>
      <div className="bg-white h-[520px] overflow-y-auto">{children}</div>
    </div>
  );
}

/** 조치 카드용 — 이 조치의 상황전파 응답 현황 */
export function DispatchStatus({ s, nodeId }: { s: Situation; nodeId: string }) {
  const list = (s.dispatches ?? []).filter((d) => d.nodeId === nodeId);
  if (!list.length) return null;
  const all = list.flatMap((d) => d.recipients);
  const recv = all.filter((r) => r.receivedAt).length;
  const done = all.filter((r) => r.completedAt).length;
  return (
    <div className="rounded-xl border border-[var(--purple-75)] bg-[var(--purple-20)] p-[12rem]">
      <div className="flex items-center gap-[8rem] typo-body-sm font-medium text-[var(--purple-600)]">
        <IconSend size={14} /> 상황전파 응답 현황
        <span className="ml-auto font-normal text-[var(--color-text-secondary)]">발송 {list.length}건 · {all.length}명 · 수신 {recv} · 완료 {done}</span>
      </div>
      <div className="h-[4rem] rounded-max bg-white/70 overflow-hidden mt-[6rem] flex">
        <div className="h-full bg-[var(--color-surface-success)]" style={{ width: `${all.length ? (done / all.length) * 100 : 0}%` }} />
        <div className="h-full bg-[var(--purple-500)]" style={{ width: `${all.length ? ((recv - done) / all.length) * 100 : 0}%` }} />
      </div>
      <div className="mt-[8rem] space-y-[4rem] max-h-[160px] overflow-y-auto pr-[2rem]">
        {list.flatMap((d) => d.recipients.map((r) => ({ d, r }))).map(({ d, r }) => (
          <div key={r.token} className="flex items-center gap-[8rem] typo-body-sm">
            <span className={cn("size-[8rem] rounded-max shrink-0", r.completedAt ? "bg-[var(--color-surface-success)]" : r.receivedAt ? "bg-[var(--purple-500)]" : "bg-[var(--color-surface-disabled-strong)]")} />
            <span className="font-medium text-[var(--color-text-primary)] truncate">{r.name} {r.position}</span>
            <span className="text-[var(--color-text-tertiary)] truncate hidden md:inline">{r.dept}</span>
            <span className="ml-auto text-[var(--color-text-tertiary)] whitespace-nowrap">{d.channels.map((c) => CHANNEL_LABEL[c]).join("·")} · {r.completedAt ? `완료 ${fmtTime(r.completedAt)}` : r.receivedAt ? `수신 ${fmtTime(r.receivedAt)}` : "대기"}</span>
            {r.note && <span className="text-[var(--color-text-success)] truncate max-w-[180rem]" title={r.note}>· {r.note}</span>}
          </div>
        ))}
      </div>
      <DsCheckbox className="hidden" checked={false} onCheckedChange={() => {}} />
    </div>
  );
}

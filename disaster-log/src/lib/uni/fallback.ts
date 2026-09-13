// ─────────────────────────────────────────────────────────────────────────────
//  연계장애 대체처리 (UFR-009-003) — UNI 서버 접속 불가 시 로컬 규칙 기반 초안 생성
//  AI 초안과 동일한 형식으로 생성하되 출처를 'fallback' 으로 표시한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { AiContext } from "./prompts";
import { fmt } from "./prompts";

const TYPE_LABEL: Record<string, string> = {
  situation: "상황",
  weather: "기상",
  document: "문서",
  sop: "SOP",
  run: "조치",
  result: "조치결과",
  memo: "현장메모",
  sms: "상황전파",
  resource: "자원",
  injection: "상황부여",
  mission: "임무",
  branch: "상황판단",
  log: "상황일지",
  report: "결과보고",
  user: "입력",
};

function hm(dt: string) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function mark(v: string) {
  return v === "confirmed" ? "" : " (확인 필요)";
}

export function fallbackLog(ctx: AiContext): string {
  const s = ctx.situation;
  const lines: string[] = [];
  lines.push(`> 기준시각 ${fmt(s.baseTime)} · 위기경보 **${s.alertLevel}** · 지역 ${s.regions.join(", ") || "-"}`);
  lines.push("");
  const sorted = [...ctx.events].sort((a, b) => a.at.localeCompare(b.at));
  let lastDay = "";
  for (const e of sorted) {
    const day = e.at.slice(0, 10);
    if (day !== lastDay) {
      if (lines.length > 2) lines.push("");
      lines.push(`### ${day.replace(/-/g, ".")}`);
      lines.push("");
      lastDay = day;
    }
    lines.push(`- **${hm(e.at)}** [${TYPE_LABEL[e.type] ?? e.type}] ${e.title}${e.body ? " — " + e.body : ""}${mark(e.verify)}`);
  }
  if (sorted.length === 0) lines.push("(누적된 이벤트가 없습니다. SOP 실행·조치결과·SMS·자원 기록이 자동으로 누적됩니다.)");
  lines.push("");
  lines.push("## 현재까지 종합");
  lines.push("");
  const results = ctx.results ?? [];
  const done = results.filter((r) => r.status === "done").length;
  lines.push(`- 대응조치 ${results.length}건 진행 중 ${done}건 완료${results.length ? ` (${results.filter((r) => r.result).map((r) => r.title).slice(0, 3).join(", ")} 등)` : ""}`);
  if (ctx.weather?.alerts.length) lines.push(`- 기상특보: ${ctx.weather.alerts.map((a) => a.type).join(" → ")} 발효 중`);
  if (ctx.sms?.length) lines.push(`- 상황전파 SMS ${ctx.sms.length}건 발송 (성공 ${ctx.sms.filter((m) => m.result === "success").length}건)`);
  if (ctx.resources?.length) lines.push(`- 재난자원 ${ctx.resources.length}종 투입 (${ctx.resources.map((r) => `${r.name} ${r.qty}${r.unit}`).slice(0, 3).join(", ")})`);
  if (ctx.injections?.length) lines.push(`- 훈련 상황부여 ${ctx.injections.length}회, 임무 완료 ${(ctx.missions ?? []).filter((m) => m.completed).length}건`);
  lines.push("- 향후: 기상 추이 모니터링 지속, 미완료 조치 이행 점검, 피해 발생 시 응급복구 및 상황보고 실시");
  return lines.join("\n");
}

function sectionBody(title: string, ctx: AiContext): string[] {
  const s = ctx.situation;
  const out: string[] = [];
  const t = title.replace(/\s/g, "");
  if (/개요/.test(t)) {
    out.push(`- 상황명: ${s.title}`);
    out.push(`- 지자체: ${s.organization} / 재난유형: ${s.disasterLabel} / 위기경보 ${s.alertLevel}`);
    out.push(`- 기준시각: ${fmt(s.baseTime)} / 발생·영향지역: ${s.regions.join(", ") || "-"}`);
    if (s.currentStatus) out.push(`- 상황 개요: ${s.currentStatus}`);
    if (s.training) out.push(`- 훈련: ${s.training.name} (${s.training.schedule}) / 참여기관 ${s.training.agencies.join(", ")}`);
  } else if (/기상/.test(t)) {
    (ctx.weather?.alerts ?? []).forEach((a) => out.push(`- ${fmt(a.effectiveAt)} ${a.type} 발효 (${a.area}): ${a.content}`));
    if (ctx.weather?.summary) out.push(`- 기상 전망(AI 요약, 확인 필요): ${ctx.weather.summary}`);
    if (out.length === 0) out.push("- 해당 자료가 선택되지 않았거나 없음");
  } else if (/향후|성과|미흡|개선|평가|종합/.test(t) || (/계획/.test(t) && !/훈련/.test(t))) {
    const results = ctx.results ?? [];
    const pending = results.filter((r) => r.status !== "done");
    out.push(`- 총 ${results.length}개 조치 중 ${results.length - pending.length}건 완료, ${pending.length}건 진행·미착수`);
    if (pending.length) out.push(`- 미완료 조치: ${pending.map((r) => r.title).slice(0, 4).join(", ")} → 담당부서 이행 점검`);
    const rec = results.filter((r) => /복구|응급|해제|점검/.test(r.title) && r.result);
    rec.forEach((r) => out.push(`- ${r.title}: ${r.result}`));
    out.push("- 기상특보 해제 시까지 상황관리 지속, 해제 후 재해취약지 사후점검 및 피해현황 확인");
    out.push("- 상황일지·조치결과를 근거로 결과보고 확정 후 행정안전부 보고");
    if (s.mode === "안전한국훈련") out.push("- 훈련 시 확인된 임무 전파·확인 지연 구간을 매뉴얼 개선과제로 반영");
  } else if (/피해|복구/.test(t) && !/조치/.test(t)) {
    const dmg = ctx.events.filter((e) => e.type !== "weather" && /피해|침수|붕괴|파손|정전|고립|이재민|통제/.test(e.title + (e.body ?? "")));
    dmg.forEach((e) => out.push(`- ${fmt(e.at)} ${e.title}${e.body ? ": " + e.body : ""}${mark(e.verify)}`));
    const rec = (ctx.results ?? []).filter((r) => /복구|응급|해제/.test(r.title) && r.result);
    rec.forEach((r) => out.push(`- ${r.title}: ${r.result}`));
    if (out.length === 0) out.push("- 현재까지 확인된 피해 없음(추가 확인 중)");
  } else if (/조치|대응|수행|비교/.test(t)) {
    (ctx.results ?? []).forEach((r) => out.push(`- ${r.title}${r.dept ? ` (${r.dept})` : ""}: ${r.status === "done" ? "완료" : r.status === "running" ? "진행 중" : r.status}${r.finishedAt ? ` ${fmt(r.finishedAt)}` : ""}${r.result ? ` — ${r.result}` : ""}`));
    if (out.length === 0) out.push("- 조치결과가 입력된 항목 없음");
  } else if (/전파|SMS/.test(t)) {
    (ctx.sms ?? []).forEach((m) => out.push(`- ${fmt(m.at)} ${m.recipients.join(", ")} 대상 SMS ${m.result === "success" ? "발송 완료" : "발송 실패"}: "${m.message.slice(0, 60)}${m.message.length > 60 ? "…" : ""}"`));
    if (out.length === 0) out.push("- SMS 발송이력 없음");
  } else if (/자원/.test(t)) {
    (ctx.resources ?? []).forEach((r) => out.push(`- ${r.name} ${r.qty}${r.unit} (${r.category}, ${r.source}) 투입 ${fmt(r.deployedAt)}${r.returnedAt ? `, 회수 ${fmt(r.returnedAt)}` : ""}`));
    if (out.length === 0) out.push("- 투입 자원 기록 없음");
  } else if (/상황부여|임무|시나리오|계획/.test(t)) {
    if (s.training) {
      out.push(`- 훈련계획: ${s.training.name} / 목적: ${s.training.purpose}`);
      out.push(`- 시나리오: ${s.training.scenario}`);
    }
    (ctx.injections ?? []).forEach((i) => out.push(`- ${fmt(i.at)} 상황부여: ${i.message}${i.target ? ` (${i.target})` : ""}`));
    (ctx.missions ?? []).forEach((m) => out.push(`- ${m.title}: 수신 ${fmt(m.received) || "-"} / 확인 ${fmt(m.confirmed) || "-"} / 완료 ${fmt(m.completed) || "-"}`));
    if (out.length === 0) out.push("- 해당 자료 없음");
  } else {
    ctx.events.slice(0, 6).forEach((e) => out.push(`- ${fmt(e.at)} ${e.title}${mark(e.verify)}`));
    if (out.length === 0) out.push("- 관련 자료 없음");
  }
  return out;
}

export function fallbackReport(ctx: AiContext): string {
  const sections = ctx.sections ?? ["개요", "대응조치(조치결과)", "향후계획"];
  return sections.map((t) => `## ${t}\n${sectionBody(t, ctx).join("\n")}`).join("\n\n");
}

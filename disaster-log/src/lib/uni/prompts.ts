// ─────────────────────────────────────────────────────────────────────────────
//  프롬프트 빌더 — 클라이언트/서버 공용 (UFR-007-003, UFR-008-004)
//  · 확인된(confirmed) 이벤트만 사실로 전달, 미확인은 '확인 필요' 표시
//  · 선택하지 않은 자료는 본문 생성에 사용하지 않는다
// ─────────────────────────────────────────────────────────────────────────────
import type { LedgerEvent, Situation } from "@/lib/types";
import { DISASTER_LABEL } from "@/lib/seed/regions";

export interface AiContext {
  situation: {
    id: string;
    mode: string;
    title: string;
    organization: string;
    disasterType: string;
    disasterLabel: string;
    baseTime: string;
    regions: string[];
    alertLevel: string;
    currentStatus?: string;
    training?: Situation["training"];
  };
  events: { at: string; type: string; title: string; body?: string; verify: string; source: string }[];
  weather?: { alerts: { type: string; area: string; effectiveAt: string; content: string }[]; summary?: string };
  results?: { title: string; dept?: string; result?: string; memo?: string; startedAt?: string; finishedAt?: string; status: string }[];
  sms?: { at: string; recipients: string[]; message: string; result: string }[];
  resources?: { name: string; category: string; qty: number; unit: string; source: string; deployedAt: string; returnedAt?: string }[];
  injections?: { at: string; message: string; target?: string }[];
  missions?: { title: string; received?: string; confirmed?: string; completed?: string; by?: string }[];
  sections?: string[];
  includes?: string[];
  templateName?: string;
}

/** 서버(Vercel=UTC)·브라우저 어디서 실행되든 한국 시간(Asia/Seoul)으로 표기 */
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
export function kstParts(dt: string) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return null;
  const o: Record<string, string> = {};
  for (const p of KST.formatToParts(d)) if (p.type !== "literal") o[p.type] = p.value;
  return { y: o.year, m: o.month, d: o.day, h: o.hour === "24" ? "00" : o.hour, mi: o.minute };
}
export function fmt(dt?: string) {
  if (!dt) return "";
  const p = kstParts(dt);
  if (!p) return dt;
  return `${p.y}.${p.m}.${p.d} ${p.h}:${p.mi}`;
}

export function buildContext(s: Situation, opts: { includes?: string[]; sections?: string[]; templateName?: string; eventFilter?: (e: LedgerEvent) => boolean } = {}): AiContext {
  const nodes = s.sopVersions.find((v) => v.id === s.activeSopVersionId)?.nodes ?? [];
  const nodeTitle = (id: string) => nodes.find((n) => n.id === id)?.data.title ?? id;
  const nodeDept = (id: string) => nodes.find((n) => n.id === id)?.data.leadDept;
  const events = s.ledger.filter((e) => e.verify !== "excluded").filter(opts.eventFilter ?? (() => true));
  const inc = new Set(opts.includes ?? ["results", "log", "sms", "resources", "weather", "damage", "photos", "plan", "injections", "missions"]);
  return {
    situation: {
      id: s.id,
      mode: s.mode === "actual" ? "실제재난" : "안전한국훈련",
      title: s.title,
      organization: s.organization,
      disasterType: s.disasterType,
      disasterLabel: DISASTER_LABEL[s.disasterType] ?? s.disasterType,
      baseTime: s.baseTime,
      regions: s.regions.map((r) => [r.sido, r.sigungu, r.dong].filter(Boolean).join(" ")),
      alertLevel: s.alertLevel,
      currentStatus: s.currentStatus,
      training: s.training,
    },
    events: events.map((e) => ({ at: e.at, type: e.type, title: e.title, body: e.body, verify: e.verify, source: e.source })),
    weather: inc.has("weather")
      ? { alerts: s.weatherAlerts.map((a) => ({ type: a.type, area: a.area, effectiveAt: a.effectiveAt, content: a.content })), summary: s.weatherSummary?.text }
      : undefined,
    results: inc.has("results")
      ? Object.values(s.runs)
          .filter((r) => r.status !== "pending")
          .map((r) => ({ title: nodeTitle(r.nodeId), dept: nodeDept(r.nodeId), result: r.result, memo: r.fieldMemo, startedAt: r.startedAt, finishedAt: r.finishedAt, status: r.status }))
      : undefined,
    sms: inc.has("sms") ? s.sms.map((m) => ({ at: m.at, recipients: m.recipients, message: m.message, result: m.result })) : undefined,
    resources: inc.has("resources") ? s.resources.map((r) => ({ name: r.name, category: r.category, qty: r.qty, unit: r.unit, source: r.source, deployedAt: r.deployedAt, returnedAt: r.returnedAt })) : undefined,
    injections: inc.has("injections") ? s.injections.map((i) => ({ at: i.at, message: i.message, target: i.target })) : undefined,
    missions: inc.has("missions")
      ? Object.values(s.runs)
          .filter((r) => r.missionAck)
          .map((r) => ({ title: nodeTitle(r.nodeId), ...r.missionAck }))
      : undefined,
    sections: opts.sections,
    includes: opts.includes,
    templateName: opts.templateName,
  };
}

const SYSTEM_BASE = `당신은 대한민국 지방자치단체 재난안전대책본부의 상황보고 담당 공무원을 보조하는 문서 작성 AI입니다.
반드시 제공된 자료(확인상태 confirmed)만 사실로 기술하고, unverified 자료는 "(확인 필요)"를 붙여 구분합니다.
제공되지 않은 수치·기관·시각을 임의로 만들지 않습니다. 공문서 어투(개조식, ~함/~임)를 사용하고 한국어로 작성합니다.`;

export function logSystemPrompt() {
  return `${SYSTEM_BASE}
출력 형식(Markdown): 날짜별로 "### YYYY.MM.DD" 제목을 두고, 각 항목은 "- **HH:MM** [유형] 내용" 한 줄로 시간순 기록합니다. 마지막에 "## 현재까지 종합" 제목 아래 3~5개 불릿을 덧붙입니다. 표는 사용하지 않습니다.`;
}

export function reportSystemPrompt() {
  return `${SYSTEM_BASE}
출력 형식(Markdown): 요청된 목차(섹션) 순서대로 "## 섹션명" 제목 뒤에 개조식 본문을 작성합니다. 항목은 "- " 불릿(하위 항목은 두 칸 들여쓰기 "  - "), 핵심 수치·시각은 **굵게**, 여러 건의 이력은 GFM 표(| 열 | … |)를 사용할 수 있습니다. 선택되지 않은 자료 항목은 언급하지 않습니다. 각 섹션은 3~8개 항목으로 간결하게 작성합니다.`;
}

export function logUserPrompt(ctx: AiContext) {
  return `다음 자료로 ${ctx.situation.mode} 상황일지 초안을 작성하십시오.

[상황 기본정보]
- 제목: ${ctx.situation.title}
- 지자체: ${ctx.situation.organization} / 재난유형: ${ctx.situation.disasterLabel} / 위기경보: ${ctx.situation.alertLevel}
- 기준시각: ${fmt(ctx.situation.baseTime)} / 발생·영향지역: ${ctx.situation.regions.join(", ") || "-"}
${ctx.situation.currentStatus ? `- 현재상황(사용자 입력): ${ctx.situation.currentStatus}` : ""}
${ctx.situation.training ? `- 훈련계획: ${ctx.situation.training.name} / 시나리오: ${ctx.situation.training.scenario}` : ""}

[기상]
${(ctx.weather?.alerts ?? []).map((a) => `- ${fmt(a.effectiveAt)} ${a.type} (${a.area}) : ${a.content}`).join("\n") || "- (자료 없음)"}
${ctx.weather?.summary ? `- AI 기상요약(확인 필요): ${ctx.weather.summary}` : ""}

[시간순 이벤트 원장]
${ctx.events.map((e) => `- ${fmt(e.at)} [${e.type}] ${e.title}${e.body ? " — " + e.body : ""} (${e.verify}, ${e.source})`).join("\n") || "- (이벤트 없음)"}

[조치결과]
${(ctx.results ?? []).map((r) => `- ${r.title}${r.dept ? " (" + r.dept + ")" : ""}: ${r.status} ${r.startedAt ? fmt(r.startedAt) : ""}~${r.finishedAt ? fmt(r.finishedAt) : ""} ${r.result ? "결과: " + r.result : ""}`).join("\n") || "- (없음)"}

[SMS]
${(ctx.sms ?? []).map((m) => `- ${fmt(m.at)} → ${m.recipients.join(", ")} (${m.result}) : ${m.message}`).join("\n") || "- (없음)"}

[자원]
${(ctx.resources ?? []).map((r) => `- ${r.name} ${r.qty}${r.unit} [${r.category}/${r.source}] 투입 ${fmt(r.deployedAt)}${r.returnedAt ? " 회수 " + fmt(r.returnedAt) : ""}`).join("\n") || "- (없음)"}
${ctx.injections && ctx.injections.length ? `\n[훈련 상황부여]\n${ctx.injections.map((i) => `- ${fmt(i.at)} ${i.message}${i.target ? " (대상: " + i.target + ")" : ""}`).join("\n")}` : ""}
${ctx.missions && ctx.missions.length ? `\n[임무 수신·확인·완료]\n${ctx.missions.map((m) => `- ${m.title}: 수신 ${fmt(m.received)} / 확인 ${fmt(m.confirmed)} / 완료 ${fmt(m.completed)} ${m.by ? "(" + m.by + ")" : ""}`).join("\n")}` : ""}`;
}

export function reportUserPrompt(ctx: AiContext) {
  return `다음 자료로 「${ctx.templateName ?? (ctx.situation.mode + " 결과보고")}」 본문 초안을 작성하십시오.
목차(이 순서대로 "## 제목" 사용): ${(ctx.sections ?? []).join(" / ")}
포함 자료: ${(ctx.includes ?? []).join(", ")}

${logUserPrompt(ctx).replace(/^다음 자료로.*\n\n/, "")}`;
}

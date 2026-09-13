// 내보내기 문서 모델 조립 — 상황일지 / 결과보고 → ExportDoc (DOCX·HWPX 공용)
import type { Situation } from "@/lib/types";
import { DISASTER_LABEL } from "@/lib/seed/regions";
import { fmtDateTime } from "@/lib/utils";
import type { ExportDoc } from "./hwpx";

function today() {
  const d = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.(${days[d.getDay()]})`;
}

export function baseMeta(s: Situation): [string, string][] {
  return [
    ["업무유형", s.mode === "actual" ? "실제재난" : "안전한국훈련"],
    ["지자체", s.organization],
    ["재난유형", DISASTER_LABEL[s.disasterType] ?? s.disasterType],
    ["위기경보", s.alertLevel],
    ["기준시각", fmtDateTime(s.baseTime)],
    ["발생·영향지역", s.regions.map((r) => [r.sigungu, r.dong].filter(Boolean).join(" ")).join(", ") || "-"],
  ];
}

/** 결과보고 → 섹션을 "## 제목" 마크다운으로 합친 문서 */
export function reportMarkdown(s: Situation): string {
  const r = s.report;
  const parts = r.sections.filter((x) => x.enabled).map((sec) => `## ${sec.title}\n\n${sec.body?.trim() || "_(내용 없음)_"}`);
  if (r.includes.sms && (s.dispatches ?? []).length) {
    const rows = (s.dispatches ?? []).flatMap((d) => d.recipients.map((x) => `| ${fmtDateTime(d.sentAt)} | ${d.title.replace(/\|/g, "／")} | ${x.name}${x.position ? " " + x.position : ""}${x.dept ? "(" + x.dept + ")" : ""} | ${d.channels.map((c) => (c === "sms" ? "SMS" : "이메일")).join("·")} | ${x.receivedAt ? fmtDateTime(x.receivedAt) : "-"} | ${x.completedAt ? fmtDateTime(x.completedAt) : "-"} | ${(x.note ?? "").replace(/\|/g, "／")} |`));
    parts.push(`## 붙임 1-1. 상황전파 수신확인·임무완료 현황\n\n| 발송시각 | 제목 | 수신자 | 채널 | 수신확인 | 임무완료 | 조치사항 |\n|---|---|---|---|---|---|---|\n${rows.join("\n")}`);
  }
  if (r.includes.sms && s.sms.length) {
    parts.push(`## 붙임 1. SMS 발송이력\n\n| 발송시각 | 수신대상 | 문안 | 결과 |\n|---|---|---|---|\n${s.sms.map((m) => `| ${fmtDateTime(m.at)} | ${m.recipients.join(", ")} | ${m.message.replace(/\|/g, "／")} | ${m.result === "success" ? "성공" : "실패"} |`).join("\n")}`);
  }
  if (r.includes.resources && s.resources.length) {
    parts.push(`## 붙임 2. 재난자원 투입현황\n\n| 자원명 | 분류 | 수량 | 출처 | 투입 | 회수 |\n|---|---|---|---|---|---|\n${s.resources.map((x) => `| ${x.name} | ${x.category} | ${x.qty}${x.unit} | ${x.source} | ${fmtDateTime(x.deployedAt)} | ${x.returnedAt ? fmtDateTime(x.returnedAt) : "-"} |`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export function reportExportDoc(s: Situation): ExportDoc {
  return {
    title: s.report.title,
    subtitle: `${s.mode === "actual" ? "결과보고" : "훈련 결과보고"} / ${today()} / ${s.createdBy}`,
    meta: baseMeta(s),
    markdown: reportMarkdown(s),
    filename: `${s.title}_${s.mode === "actual" ? "결과보고" : "훈련결과보고"}`,
  };
}

export function logExportDoc(s: Situation, markdown?: string): ExportDoc {
  return {
    title: `${s.organization} ${s.mode === "actual" ? "재난" : "훈련"} 상황일지`,
    subtitle: `${s.title} / ${today()} / ${s.createdBy}${s.log.confirmedAt ? "" : " (초안)"}`,
    meta: baseMeta(s),
    markdown: markdown ?? s.log.final ?? s.log.draft,
    filename: `${s.title}_상황일지`,
  };
}

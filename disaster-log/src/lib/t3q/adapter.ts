// ─────────────────────────────────────────────────────────────────────────────
//  T3Q Adapter (모의) — 시나리오 S03~S05 / UFR-003, UFR-004-001~002, UFR-002-002
//  실제 T3Q API 는 사용하지 않는다. 역할 경계(문서 파일명 목록 → 선택 문서 기반
//  조치목록+상세정보 일괄 반환 → 기상요약)만 동일 인터페이스로 구현하여
//  후일 실 API 연결 시 이 파일만 교체하면 되도록 한다.
// ─────────────────────────────────────────────────────────────────────────────
import { DOCUMENTS } from "@/lib/seed/documents";
import { FLOOD_ACTIONS, FLOOD_CORE_CODES } from "@/lib/seed/flood";
import { WILDFIRE_ACTIONS } from "@/lib/seed/wildfire";
import { mockWeatherSummary } from "@/lib/seed/weather";
import type { DisasterType, ManualDocument, Mode, RecommendedAction, Stage, WeatherAlert } from "@/lib/types";

export interface SituationContext {
  mode: Mode;
  organization: string;
  disasterType: DisasterType;
  regions: string[];
  currentStatus?: string;
  alertLevel?: string;
  trainingScenario?: string;
  injections?: string[];
}

export interface T3QAdapter {
  /** S03: 관련 문서 파일명 목록 */
  searchDocuments(ctx: SituationContext): Promise<ManualDocument[]>;
  /** S05: 선택 문서 기준 조치목록 + 상세정보 일괄 반환 (1회 호출) */
  recommendActions(ctx: SituationContext, selectedDocIds: string[]): Promise<RecommendedAction[]>;
  /** S02: 기상 MCP 요약 */
  weatherSummary(ctx: SituationContext, alerts: WeatherAlert[]): Promise<string>;
}

const STAGE_ORDER: Stage[] = ["징후감지", "초기대응", "비상대응", "수습·복구"];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 현재상황 텍스트에서 단계 힌트 추출 */
function inferStages(ctx: SituationContext): Stage[] {
  const text = `${ctx.currentStatus ?? ""} ${ctx.trainingScenario ?? ""} ${(ctx.injections ?? []).join(" ")} ${ctx.alertLevel ?? ""}`;
  if (/해제|복구|수습|피해조사|이재민/.test(text)) return ["비상대응", "수습·복구"];
  if (/경보|심각|경계|침수|붕괴|인명|대피|고립/.test(text)) return ["초기대응", "비상대응"];
  if (/예비특보|주의보|주의|관심/.test(text)) return ["징후감지", "초기대응"];
  return ["초기대응", "비상대응"];
}

export const mockT3Q: T3QAdapter = {
  async searchDocuments(ctx) {
    await delay(700);
    const docs = DOCUMENTS.filter((d) => d.disasterTypes.includes(ctx.disasterType));
    const scored = docs.map((d) => {
      let s = 0;
      if (d.organization.includes(ctx.organization.replace("광역시", "").slice(0, 2))) s += 3;
      if (ctx.mode === "training" && d.category === "훈련") s += 4;
      if (ctx.mode === "actual" && d.category === "훈련") s -= 2;
      if (d.category === "행동매뉴얼") s += 2;
      if (/대피/.test(ctx.currentStatus ?? "") && /대피/.test(d.fileName)) s += 2;
      if (/복구|이재민/.test(ctx.currentStatus ?? "") && (d.category === "복구")) s += 2;
      return { d, s };
    });
    return scored.sort((a, b) => b.s - a.s).map((x) => x.d);
  },

  async recommendActions(ctx, selectedDocIds) {
    await delay(1200);
    const pool: RecommendedAction[] = [];
    if (selectedDocIds.some((id) => ["doc-busan-flood-2026", "doc-flood-practice", "doc-river-safety-2023", "doc-evacuation-order", "doc-relief-plan", "doc-recovery-report-form", "doc-citizen-guide"].includes(id))) {
      pool.push(...FLOOD_ACTIONS);
    }
    if (selectedDocIds.some((id) => ["doc-wildfire-2024", "doc-wildfire-standard"].includes(id))) {
      pool.push(...WILDFIRE_ACTIONS);
    }
    if (pool.length === 0) {
      // 문서 유형과 무관하게 재난유형 기본 Seed 반환 (연계장애 대체처리 UFR-009-003)
      pool.push(...(ctx.disasterType === "wildfire" ? WILDFIRE_ACTIONS : FLOOD_ACTIONS));
    }
    const stages = inferStages(ctx);
    const core = new Set(FLOOD_CORE_CODES);
    const sorted = [...pool].sort((a, b) => {
      const sa = STAGE_ORDER.indexOf(a.stage);
      const sb = STAGE_ORDER.indexOf(b.stage);
      const pa = stages.includes(a.stage) ? 0 : 1;
      const pb = stages.includes(b.stage) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (sa !== sb) return sa - sb;
      const ca = core.has(a.code) ? 0 : 1;
      const cb = core.has(b.code) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.page! - b.page!;
    });
    return sorted;
  },

  async weatherSummary(ctx, alerts) {
    await delay(900);
    return mockWeatherSummary(ctx.organization, ctx.disasterType, alerts);
  },
};

export function stageOrder(s: Stage) {
  return STAGE_ORDER.indexOf(s);
}

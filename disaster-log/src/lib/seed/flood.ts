import raw from "@/data/flood_actions.json";
import type { RecommendedAction, Stage } from "@/lib/types";

interface RawCard {
  page: number;
  stage: string;
  code: string;
  title: string;
  content: string;
  lead: string;
  support: string;
  coop: string;
  detail: string[];
  targets: string[];
  resources: string[];
}

const DOC_ID = "doc-busan-flood-2026";

/** PDF 추출 시 붙어버린 조치명에 공백을 넣어 가독성 보정 */
function prettifyTitle(t: string): string {
  const VERBS = "접수|보고|전파|지시|확인|점검|운영|강화|실시|편성|파악|지원|가동|해제|개최|배치|결정|수립|조사|처리|통제|대피|구호|복구|홍보|관리|정비|요청|시행|교육|제출|취합|확보|활동|발령|발표|소집|명령|건의|방문|발송";
  let out = t.replace(/\s+/g, " ").trim();
  out = out
    .replace(/([가-힣])(\()/g, "$1 $2")
    .replace(/(\))([가-힣])/g, "$1 $2")
    .replace(/에따른/g, "에 따른 ")
    .replace(/([가-힣])및([가-힣])/g, "$1 및 $2")
    .replace(/([가-힣]{2,})등([가-힣])/g, "$1 등 $2")
    .replace(/([가-힣]{3,})(현황|체계|시설물|연락망)([가-힣])/g, "$1 $2 $3")
    .replace(new RegExp(`([가-힣]{2,})(${VERBS})(?=[\s(,․]|$|(${VERBS}))`, "g"), "$1 $2");
  return out.replace(/\s{2,}/g, " ").trim();
}

const seen = new Map<string, number>();
function uniqueId(code: string) {
  const n = (seen.get(code) ?? 0) + 1;
  seen.set(code, n);
  return n === 1 ? `flood-${code}` : `flood-${code}-${n}`;
}

export const FLOOD_ACTIONS: RecommendedAction[] = (raw as RawCard[]).map((c) => ({
  id: uniqueId(c.code),
  code: c.code,
  title: prettifyTitle(c.title),
  summary: c.content,
  stage: c.stage as Stage,
  leadDept: c.lead,
  supportDept: c.support,
  coopAgencies: c.coop,
  details: c.detail.slice(0, 10),
  targets: c.targets,
  resources: c.resources,
  sourceDocId: DOC_ID,
  page: c.page,
}));

/** 부산 풍수해 1차 Seed 검증용 핵심 조치 (초기대응 기본 추천 순서) */
export const FLOOD_CORE_CODES = ["4-1", "5-1", "5-2", "6-1", "6-2", "6-3", "6-4", "6-5", "6-6", "6-7", "40-1", "40-5"];

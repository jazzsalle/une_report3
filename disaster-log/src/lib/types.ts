// ─────────────────────────────────────────────────────────────────────────────
//  도메인 타입 — 재난상황일지 생성도구
//  요구사항정의서 v0.5 (UFR-001 ~ UFR-009) / 시나리오 v0.9 (S01~S13) 기준
// ─────────────────────────────────────────────────────────────────────────────

/** 업무유형: 실제재난 / 안전한국훈련 (UFR-001-001) */
export type Mode = "actual" | "training";

/** 재난유형 (Seed: 풍수해 1차, 산불 교차검증) */
export type DisasterType = "flood" | "typhoon" | "heavy_snow" | "wildfire";

/** 위기경보 수준 */
export type AlertLevel = "관심" | "주의" | "경계" | "심각";

/** 대응단계 */
export type Stage = "징후감지" | "초기대응" | "비상대응" | "수습·복구";

/** 데이터 출처 (UFR-009-001) */
export type SourceKind = "user" | "official" | "ai" | "system" | "sms" | "resource" | "sop";

/** 확인상태 (UFR-009-001) */
export type VerifyState = "confirmed" | "unverified" | "excluded";

export interface Region {
  sido: string;
  sigungu?: string;
  dong?: string;
}

/** 기상특보(공식) — 열람용 (UFR-002-001) */
export interface WeatherAlert {
  id: string;
  type: string; // 호우주의보 / 호우경보 / 태풍경보 ...
  area: string;
  issuedAt: string; // ISO
  effectiveAt: string;
  content: string;
  source: "기상청";
  fetchedAt: string;
}

/** AI 기상요약 (UFR-002-002) */
export interface WeatherSummary {
  text: string;
  source: "T3Q 기상 MCP(모의)";
  fetchedAt: string;
  verify: VerifyState;
}

/** 훈련계획·시나리오 (UFR-001-006) */
export interface TrainingPlan {
  name: string;
  purpose: string;
  scenario: string;
  agencies: string[];
  schedule: string;
}

/** 상황부여 (UFR-001-007) */
export interface Injection {
  id: string;
  at: string;
  message: string;
  target?: string;
}

/** 관련 문서 (UFR-003) */
export interface ManualDocument {
  id: string;
  fileName: string;
  disasterTypes: DisasterType[];
  organization: string;
  category: "행동매뉴얼" | "실무매뉴얼" | "지침" | "복구" | "훈련";
  year: number;
  pages?: number;
  description?: string;
}

/** T3Q 추천 조치 — 조치코드/조치명/단계/담당·지원·협업기관/세부행동/전파대상/필요자원 (UFR-004-002) */
export interface RecommendedAction {
  id: string;
  code: string;
  title: string;
  summary: string;
  stage: Stage;
  leadDept: string;
  supportDept: string;
  coopAgencies: string;
  details: string[];
  targets: string[];
  resources: string[];
  sourceDocId: string;
  page?: number;
}

// ── SOP 컴포넌트 모델 (기존 UNE SOP 자동생성 모듈 계약) ──────────────────────

/** 노드 유형 키 (CompnTyCode ↔ key 매핑은 lib/sop/compn.ts) */
export type NodeKind = "start" | "process" | "decision" | "spread" | "resource" | "end";

export interface SubMission {
  id: number;
  title: string;
  type: "common" | "spread";
  dffTyCode: string;
  detail: string;
  spreadContent: string;
  note: string;
  manager: string[];
  recipient: string[];
}

export interface SopNodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  autoRun: boolean;
  /** 담당부서·지원부서·협업기관·세부행동·전파대상·필요자원 (UFR-004-007) */
  leadDept?: string;
  supportDept?: string;
  coopAgencies?: string;
  details?: string[];
  targets?: string[];
  resources?: string[];
  subMissions: SubMission[];
  /** 상황판단 노드 분기값 목록 (UFR-004-008) */
  branches?: string[];
  ui: { color?: string; fontSize?: number; charstSort?: string };
  actionId?: string;
}

export interface SopNode {
  id: string;
  type: "sop";
  position: { x: number; y: number };
  width?: number;
  height?: number;
  data: SopNodeData;
}

export interface SopEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
}

export interface SopVersion {
  id: string;
  version: number;
  label: string; // 추천 원본 / 수정본 / 실행본
  kind: "recommended" | "edited" | "confirmed";
  createdAt: string;
  createdBy: string;
  nodes: SopNode[];
  edges: SopEdge[];
  note?: string;
  /** 라이브러리에서 배포된 경우 원본 템플릿과 게시 버전 */
  templateId?: string;
  templateVersion?: number;
}

// ── SOP 라이브러리 (상황과 독립된 SOP 템플릿 · 편집/게시 분리) ─────────────

export type SopTemplateStatus = "draft" | "published";
export type SopTemplateSource = "manual" | "actions" | "ai" | "situation";

export interface SopPublished {
  version: number;
  nodes: SopNode[];
  edges: SopEdge[];
  publishedAt: string;
  publishedBy: string;
  note?: string;
}

export interface SopTemplate {
  id: string;
  name: string;
  description?: string;
  disasterTypes: DisasterType[];
  stage?: Stage;
  tags: string[];
  status: SopTemplateStatus;
  /** 편집 중인 초안 (실행 불가) */
  draft: { nodes: SopNode[]; edges: SopEdge[] };
  /** 게시본 (실행 가능) — 게시 시점 스냅샷 */
  published?: SopPublished;
  /** 게시 이력 */
  history: { version: number; publishedAt: string; publishedBy: string; note?: string; nodeCount: number }[];
  /** 상황에 배포된 이력 */
  usage: { situationId: string; situationTitle: string; deployedAt: string; version: number }[];
  source: SopTemplateSource;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ── 실행 (UFR-005) ───────────────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "done" | "skipped";

export interface NodeRun {
  nodeId: string;
  status: RunStatus;
  startedAt?: string;
  finishedAt?: string;
  assignee?: string;
  fieldMemo?: string; // 현장메모 (UFR-005-004)
  result?: string; // 조치결과 (UFR-005-005)
  branchValue?: string; // 상황판단 분기값 (UFR-005-010)
  attachments?: { name: string; size: number }[];
  /** 훈련 임무 수신·확인·완료 (UFR-005-009) */
  missionAck?: { received?: string; confirmed?: string; completed?: string; by?: string };
}

export interface SmsRecord {
  id: string;
  at: string;
  nodeId?: string;
  recipients: string[];
  message: string;
  result: "success" | "fail";
  resent?: boolean;
}

export type ResourceSource = "manual" | "internal" | "KRMS";

export interface ResourceRecord {
  id: string;
  nodeId?: string;
  name: string;
  category: "인력" | "장비" | "자재";
  qty: number;
  unit: string;
  source: ResourceSource;
  deployedAt: string;
  returnedAt?: string;
}

// ── 상황 이벤트 원장 (UFR-007) ───────────────────────────────────────────────

export type EventType =
  | "situation"
  | "weather"
  | "document"
  | "sop"
  | "run"
  | "result"
  | "memo"
  | "sms"
  | "resource"
  | "injection"
  | "mission"
  | "branch"
  | "log"
  | "report"
  | "user";

export interface LedgerEvent {
  id: string;
  at: string;
  type: EventType;
  title: string;
  body?: string;
  source: SourceKind;
  verify: VerifyState;
  refId?: string;
  actor?: string;
}

// ── 상황일지 / 결과보고 ──────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  at: string;
  content: string;
  eventIds: string[];
}

export interface SituationLog {
  templateId: string;
  draft: string;
  final?: string;
  entries: LogEntry[];
  generatedAt?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  history: { at: string; by: string; note: string }[];
}

export interface ReportSection {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

export interface Report {
  type: "actual" | "training";
  title: string;
  sections: ReportSection[];
  includes: Record<string, boolean>; // 조치결과/상황일지/SMS/자원/기상/피해복구/사진/상황부여/임무이력
  generatedAt?: string;
  history: { at: string; by: string; note: string }[];
}

// ── 업무 세션 (상황) ─────────────────────────────────────────────────────────

export interface Situation {
  id: string;
  mode: Mode;
  title: string;
  disasterType: DisasterType;
  organization: string; // 지자체
  baseTime: string; // 기준시각
  regions: Region[];
  currentStatus?: string; // 현재상황(선택)
  alertLevel: AlertLevel;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  status: "active" | "closed";

  training?: TrainingPlan;
  injections: Injection[];

  weatherAlerts: WeatherAlert[];
  weatherSummary?: WeatherSummary;

  recommendedDocs: ManualDocument[];
  selectedDocIds: string[];
  recommendedActions: RecommendedAction[];
  selectedActionIds: string[]; // 선택+순서

  sopVersions: SopVersion[];
  activeSopVersionId?: string;

  runs: Record<string, NodeRun>;
  running: boolean;
  currentNodeId?: string;

  sms: SmsRecord[];
  resources: ResourceRecord[];
  ledger: LedgerEvent[];

  log: SituationLog;
  report: Report;
}

// ─────────────────────────────────────────────────────────────────────────────
//  UNI RAG System 클라이언트 (서버 전용) — 「SOP자동생성_API가이드」 규격
//  · POST /auth/login  → { token }  (30일, 401 시 재발급)
//  · GET  /models/     → available 모델 중 선호 계열 선택 (모델명 고정 금지)
//  · POST /chat/json   → SSE (__status__/__compn__/__sources__/__done__/__error__)
//  · POST {UNI_CHAT_PATH} → 일반 챗 SSE (보고서·상황일지 초안)
//  호출부를 이 파일 한 곳에 모아 상류 계약 변경 시 여기만 수정한다.
// ─────────────────────────────────────────────────────────────────────────────
import "server-only";

export interface UniConfig {
  baseUrl: string;
  account: string;
  password: string;
  preferModel: string;
  forceModel: string;
  chatPath: string;
  sopPath: string;
  headerTimeoutMs: number;
  fallback: boolean;
}

export function getConfig(): UniConfig {
  return {
    baseUrl: (process.env.UNI_BASE_URL ?? "http://10.20.10.101:8000").replace(/\/+$/, ""),
    account: process.env.UNI_ACCOUNT ?? "",
    password: process.env.UNI_PASSWORD ?? "",
    preferModel: process.env.UNI_PREFER_MODEL ?? "qwen",
    forceModel: process.env.UNI_FORCE_MODEL ?? "",
    chatPath: process.env.UNI_CHAT_PATH ?? "/chat",
    sopPath: process.env.UNI_SOP_PATH ?? "/chat/json",
    headerTimeoutMs: Number(process.env.UNI_HEADER_TIMEOUT ?? 60) * 1000,
    fallback: (process.env.UNI_FALLBACK ?? "true") !== "false",
  };
}

// ── 토큰 캐시 (프로세스 메모리) ──────────────────────────────────────────────
let tokenCache: { token: string; at: number } | null = null;
const TOKEN_TTL = 29 * 24 * 3600_000;

/** 연결 실패 시 짧은 시간 동안 즉시 실패(circuit breaker) → 대체 생성으로 빠르게 전환 */
let unreachableUntil = 0;
const UNREACHABLE_COOLDOWN_MS = 60_000;

export class UniError extends Error {
  constructor(
    message: string,
    public status?: number,
    public reachable = true,
  ) {
    super(message);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    unreachableUntil = Date.now() + UNREACHABLE_COOLDOWN_MS;
    throw new UniError(`UNI 서버 연결 실패 (${url}): ${msg}`, undefined, false);
  } finally {
    clearTimeout(t);
  }
}

export async function login(force = false, ignoreBreaker = false): Promise<string> {
  const cfg = getConfig();
  if (!force && tokenCache && Date.now() - tokenCache.at < TOKEN_TTL) return tokenCache.token;
  if (!ignoreBreaker && Date.now() < unreachableUntil) throw new UniError(`UNI 서버 연결 불가 (최근 실패, ${Math.ceil((unreachableUntil - Date.now()) / 1000)}초 후 재시도)`, undefined, false);
  if (!cfg.account || !cfg.password) throw new UniError("UNI_ACCOUNT / UNI_PASSWORD 환경변수가 설정되지 않았습니다.", 401);
  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/auth/login`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: cfg.account, password: cfg.password }) },
    5000,
  );
  unreachableUntil = 0;
  if (!res.ok) throw new UniError(`UNI 로그인 실패: ${res.status}`, res.status);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new UniError("UNI 로그인 응답에 token 필드가 없습니다.", 500);
  tokenCache = { token: json.token, at: Date.now() };
  return json.token;
}

// ── 모델 선택 (매 요청 조회, 5분 캐시) ─────────────────────────────────────
interface ModelInfo {
  key: string;
  available?: boolean;
  [k: string]: unknown;
}
let modelCache: { key: string; at: number; all: ModelInfo[] } | null = null;

export async function pickModel(token: string): Promise<{ key: string; all: ModelInfo[] }> {
  const cfg = getConfig();
  if (cfg.forceModel) return { key: cfg.forceModel, all: modelCache?.all ?? [] };
  if (modelCache && Date.now() - modelCache.at < 5 * 60_000) return { key: modelCache.key, all: modelCache.all };
  const res = await fetchWithTimeout(`${cfg.baseUrl}/models/`, { headers: { Authorization: `Bearer ${token}` } }, 8000);
  if (res.status === 401) throw new UniError("토큰 만료", 401);
  if (!res.ok) throw new UniError(`모델 목록 조회 실패: ${res.status}`, res.status);
  const json = (await res.json()) as { models?: ModelInfo[] };
  const models = (json.models ?? []).filter((m) => m.available && m.key);
  if (models.length === 0) throw new UniError("available 한 모델이 없습니다 (상류 이상).", 503);
  const preferred = models.filter((m) => m.key.toLowerCase().includes(cfg.preferModel.toLowerCase()));
  const key = (preferred[0] ?? models[0]).key;
  modelCache = { key, at: Date.now(), all: json.models ?? [] };
  return { key, all: json.models ?? [] };
}

async function withAuth<T>(fn: (token: string) => Promise<T>): Promise<T> {
  let token = await login();
  try {
    return await fn(token);
  } catch (e) {
    if (e instanceof UniError && e.status === 401) {
      token = await login(true);
      return fn(token);
    }
    throw e;
  }
}

/** SSE 스트림 요청 — 헤더 수신까지만 타임아웃 적용, 본문은 무제한 */
async function streamPost(path: string, body: Record<string, unknown>): Promise<Response> {
  const cfg = getConfig();
  return withAuth(async (token) => {
    const res = await fetchWithTimeout(
      `${cfg.baseUrl}${path}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
      },
      cfg.headerTimeoutMs,
    );
    if (res.status === 401) throw new UniError("토큰 만료", 401);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UniError(`UNI ${path} 비정상 응답 ${res.status}: ${text.slice(0, 200)}`, res.status);
    }
    if (!res.body) throw new UniError("응답 본문이 없습니다.", 500);
    return res;
  });
}

/** SOP 생성 (/chat/json) */
export async function streamSop(query: string, topK = 5): Promise<{ res: Response; model: string }> {
  const cfg = getConfig();
  const token = await login();
  const { key } = await pickModel(token);
  const res = await streamPost(cfg.sopPath, { query, model_key: key, top_k: topK });
  return { res, model: key };
}

/** 일반 챗 (보고서·상황일지 초안) */
export async function streamChat(query: string, system?: string, topK = 3): Promise<{ res: Response; model: string }> {
  const cfg = getConfig();
  const token = await login();
  const { key } = await pickModel(token);
  const body: Record<string, unknown> = { query, model_key: key, top_k: topK };
  if (system) body.system = system;
  const res = await streamPost(cfg.chatPath, body);
  return { res, model: key };
}

export async function health(): Promise<{ reachable: boolean; model?: string; models?: string[]; error?: string; baseUrl: string; fallback: boolean }> {
  const cfg = getConfig();
  try {
    const token = await login(false, true);
    const { key, all } = await pickModel(token);
    return { reachable: true, model: key, models: all.map((m) => `${m.key}${m.available ? "" : " (unavailable)"}`), baseUrl: cfg.baseUrl, fallback: cfg.fallback };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { reachable: false, error: err, baseUrl: cfg.baseUrl, fallback: cfg.fallback };
  }
}

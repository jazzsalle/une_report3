import "server-only";
// ─────────────────────────────────────────────────────────────────────────────
//  상황전파 서버 저장소 — 현장 요원(모바일)의 수신확인·임무완료 응답을 상황실 브라우저로 되돌려 준다.
//  · 기본: 프로세스 메모리(globalThis). 로컬/단일 인스턴스에서 동작. Vercel 서버리스는 인스턴스가 바뀌면 유실될 수 있음
//  · UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 이 있으면 Upstash Redis(REST) 로 영속화 — 배포 환경 권장
// ─────────────────────────────────────────────────────────────────────────────
import type { DispatchAck, DispatchPayload } from "@/lib/types";

const TTL_SEC = 7 * 24 * 3600;

interface Mem {
  payloads: Map<string, DispatchPayload>;
  acks: Map<string, DispatchAck[]>; // situationId → acks
  tokenSit: Map<string, string>; // token → situationId
}
const g = globalThis as unknown as { __dispatchMem?: Mem };
const mem: Mem = g.__dispatchMem ?? { payloads: new Map(), acks: new Map(), tokenSit: new Map() };
g.__dispatchMem = mem;

// Upstash 콘솔(UPSTASH_*) 또는 Vercel 마켓플레이스 연동(KV_* 별칭) 어느 이름으로 주입되어도 인식
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const backend: "upstash" | "memory" = url && token ? "upstash" : "memory";

async function redis<T = unknown>(cmd: (string | number)[]): Promise<T> {
  const r = await fetch(`${url}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cmd), cache: "no-store" });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const j = (await r.json()) as { result: T; error?: string };
  if (j.error) throw new Error(j.error);
  return j.result;
}

export async function savePayloads(situationId: string, payloads: DispatchPayload[]) {
  if (backend === "upstash") {
    for (const p of payloads) {
      await redis(["SET", `dl:payload:${p.t}`, JSON.stringify(p), "EX", TTL_SEC]);
      await redis(["SET", `dl:tokensit:${p.t}`, situationId, "EX", TTL_SEC]);
    }
    return;
  }
  for (const p of payloads) {
    mem.payloads.set(p.t, p);
    mem.tokenSit.set(p.t, situationId);
  }
}

export async function getPayload(tok: string): Promise<DispatchPayload | null> {
  if (backend === "upstash") {
    const s = await redis<string | null>(["GET", `dl:payload:${tok}`]);
    return s ? (JSON.parse(s) as DispatchPayload) : null;
  }
  return mem.payloads.get(tok) ?? null;
}

/** 응답 추가. situationId 는 payload 등록이 없었던 경우(링크만으로 열림) 클라이언트가 함께 보낸 값을 사용 */
export async function addAck(tok: string, ack: Omit<DispatchAck, "token">, situationIdHint?: string) {
  const full: DispatchAck = { token: tok, ...ack };
  if (backend === "upstash") {
    const sid = (await redis<string | null>(["GET", `dl:tokensit:${tok}`])) ?? situationIdHint;
    if (!sid) return false;
    await redis(["RPUSH", `dl:acks:${sid}`, JSON.stringify(full)]);
    await redis(["EXPIRE", `dl:acks:${sid}`, TTL_SEC]);
    return true;
  }
  const sid = mem.tokenSit.get(tok) ?? situationIdHint;
  if (!sid) return false;
  if (!mem.tokenSit.has(tok)) mem.tokenSit.set(tok, sid);
  const list = mem.acks.get(sid) ?? [];
  list.push(full);
  mem.acks.set(sid, list);
  return true;
}

export async function listAcks(situationId: string, since?: string): Promise<DispatchAck[]> {
  let list: DispatchAck[];
  if (backend === "upstash") {
    const raw = await redis<string[]>(["LRANGE", `dl:acks:${situationId}`, 0, -1]);
    list = raw.map((s) => JSON.parse(s) as DispatchAck);
  } else list = mem.acks.get(situationId) ?? [];
  return since ? list.filter((a) => a.at > since) : list;
}

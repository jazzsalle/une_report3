// ─────────────────────────────────────────────────────────────────────────────
//  상황전파 모바일 링크 payload 인코딩 — 브라우저·서버 공용 (base64url)
//  링크만으로 모바일 페이지가 렌더되도록 필요한 최소 정보만 담는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { DispatchPayload } from "@/lib/types";

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodePayload(p: DispatchPayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(p)));
}
export function decodePayload(s: string): DispatchPayload | null {
  try {
    const obj = JSON.parse(new TextDecoder().decode(fromBase64Url(s)));
    if (obj && obj.v === 1 && obj.t && obj.title) return obj as DispatchPayload;
    return null;
  } catch {
    return null;
  }
}

/** 모바일 링크 — origin + /m/{token}?p=payload */
export function buildLink(origin: string, p: DispatchPayload): string {
  return `${origin}/m/${p.t}?p=${encodePayload(p)}`;
}

/** 링크에 붙는 SMS 문안(모의) — 실제 SMS 는 URL 단축 서비스와 함께 사용 권장 */
export function smsText(p: DispatchPayload, link: string): string {
  const head = p.title.startsWith("[") ? p.title : `[${p.org} 재대본] ${p.title}`;
  return `${head}\n${p.msg.slice(0, 60)}${p.msg.length > 60 ? "…" : ""}\n▶ 수신확인·임무완료: ${link}`;
}

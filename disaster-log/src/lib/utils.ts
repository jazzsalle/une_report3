import { clsx, type ClassValue } from "clsx";
import { nanoid } from "nanoid";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export const uid = (prefix = "") => `${prefix}${nanoid(10)}`;

export const nowIso = () => new Date().toISOString();

const p = (n: number) => String(n).padStart(2, "0");

export function fmtDateTime(dt?: string) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtTime(dt?: string) {
  if (!dt) return "--:--";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "--:--";
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(dt?: string) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return dt;
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/** datetime-local input 용 (로컬 시간대) */
export function toLocalInput(dt?: string) {
  const d = dt ? new Date(dt) : new Date();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString();
}

export function relTime(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

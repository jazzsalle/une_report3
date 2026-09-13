// ─────────────────────────────────────────────────────────────────────────────
//  조직·연락처 엑셀 양식 다운로드 / 일괄 업로드 파서 (SheetJS)
//  컬럼: 부서명 · 직위 · 이름 · 전화번호 · 이메일 · 비고
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from "xlsx";
import type { Contact, ContactInput } from "@/lib/types";

export const COLUMNS = ["부서명", "직위", "이름", "전화번호", "이메일", "비고"] as const;

/** 헤더 별칭 — 지자체별로 다른 표기를 흡수 */
const ALIAS: Record<(typeof COLUMNS)[number], string[]> = {
  부서명: ["부서명", "부서", "소속", "소속부서", "실국", "과", "dept", "department"],
  직위: ["직위", "직급", "직책", "position", "title", "grade"],
  이름: ["이름", "성명", "담당자", "담당자명", "name"],
  전화번호: ["전화번호", "연락처", "휴대폰", "휴대전화", "핸드폰", "전화", "mobile", "phone", "tel"],
  이메일: ["이메일", "메일", "email", "e-mail", "mail"],
  비고: ["비고", "메모", "참고", "note", "remark"],
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

/** 숫자만 남기고 000-0000-0000 형태로 정규화 (지역번호·내선은 최대한 보존) */
export function normalizePhone(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return digits.startsWith("02") ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 9 && digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return raw;
}

export const isValidEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export interface ParsedRow {
  row: number; // 엑셀 행 번호(1-base)
  data: ContactInput;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  headerMap: Record<string, string>;
  missing: string[]; // 필수 컬럼 누락
  sheet: string;
}

/** 업로드 파일(xlsx/xls/csv) → 연락처 행 파싱 + 검증 */
export async function parseContactsFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", codepage: 949 });
  // 「연락처」 시트가 있으면 우선, 없으면 첫 시트
  const sheetName = wb.SheetNames.find((n) => /연락처|contacts?/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (!aoa.length) return { rows: [], headerMap: {}, missing: [...COLUMNS.slice(0, 4)], sheet: sheetName };

  // 헤더 행 찾기 — 상위 5행 중 별칭 매칭이 가장 많은 행
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const hits = (aoa[i] ?? []).filter((c) => Object.values(ALIAS).some((al) => al.map(norm).includes(norm(c)))).length;
    if (hits > best) {
      best = hits;
      headerIdx = i;
    }
  }
  const header = (aoa[headerIdx] ?? []).map(norm);
  const colIdx: Partial<Record<(typeof COLUMNS)[number], number>> = {};
  const headerMap: Record<string, string> = {};
  for (const col of COLUMNS) {
    const idx = header.findIndex((h) => ALIAS[col].map(norm).includes(h));
    if (idx >= 0) {
      colIdx[col] = idx;
      headerMap[col] = String(aoa[headerIdx][idx]);
    }
  }
  const missing = (["부서명", "직위", "이름", "전화번호"] as const).filter((c) => colIdx[c] === undefined);

  const rows: ParsedRow[] = [];
  const seenPhone = new Map<string, number>();
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r] ?? [];
    const get = (c: (typeof COLUMNS)[number]) => (colIdx[c] === undefined ? "" : String(line[colIdx[c]!] ?? "").trim());
    const data: ContactInput = { dept: get("부서명"), position: get("직위"), name: get("이름"), phone: normalizePhone(get("전화번호")), email: get("이메일") || undefined, note: get("비고") || undefined };
    if (!data.dept && !data.position && !data.name && !data.phone) continue; // 완전 빈 행
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!data.name) errors.push("이름 없음");
    if (!data.dept) errors.push("부서명 없음");
    if (!data.phone) errors.push("전화번호 없음");
    else if (data.phone.replace(/[^0-9]/g, "").length < 8) errors.push("전화번호 형식 오류");
    if (!data.position) warnings.push("직위 없음");
    if (data.email && !isValidEmail(data.email)) warnings.push("이메일 형식 확인");
    const key = data.phone.replace(/[^0-9]/g, "");
    if (key) {
      if (seenPhone.has(key)) warnings.push(`${seenPhone.get(key)}행과 전화번호 중복`);
      else seenPhone.set(key, r + 1);
    }
    rows.push({ row: r + 1, data, errors, warnings });
  }
  return { rows, headerMap, missing, sheet: sheetName };
}

/** 업로드 양식(xlsx) — 「연락처」 시트(헤더+예시 3행) + 「작성안내」 시트 */
export function buildTemplateWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const sample = [
    [...COLUMNS],
    ["재난안전상황실", "상황팀장", "홍길동", "010-0000-0001", "hong@example.go.kr", "야간 당직 총괄"],
    ["산림녹지과", "과장", "김산림", "010-0000-0002", "forest@example.go.kr", ""],
    ["안전총괄과", "주무관", "이안전", "055-000-0003", "", "예시 행은 삭제 후 사용"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 26 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "연락처");

  const guide = [
    ["재난상황일지 생성도구 · 조직·연락처 일괄 업로드 양식"],
    [""],
    ["컬럼", "필수", "설명"],
    ["부서명", "필수", "실·국·과 등 소속 부서 (예: 재난안전상황실)"],
    ["직위", "권장", "직위 또는 직급 (예: 과장, 팀장, 주무관)"],
    ["이름", "필수", "성명"],
    ["전화번호", "필수", "휴대폰 또는 사무실 번호. 하이픈 없이 입력해도 자동 정리됩니다"],
    ["이메일", "선택", "메일 주소"],
    ["비고", "선택", "당직·담당 업무 등 참고"],
    [""],
    ["· 1행(헤더)은 지우지 마세요. 헤더 이름은 「부서/소속」「직급」「성명」「연락처/휴대폰」 등 유사 표기도 인식합니다."],
    ["· 예시 행(2~4행)은 삭제하고 실제 데이터를 입력하세요."],
    ["· 업로드 시 「추가」「병합(전화번호·이름 기준 갱신)」「전체 교체」 중 선택할 수 있습니다."],
    ["· 업로드한 연락처는 이 브라우저(localStorage)에만 저장되며 외부로 전송되지 않습니다."],
  ];
  const wg = XLSX.utils.aoa_to_sheet(guide);
  wg["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wg, "작성안내");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** 현재 목록 내보내기 (동일 양식) */
export function buildExportWorkbook(contacts: Contact[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const aoa = [[...COLUMNS], ...contacts.map((c) => [c.dept, c.position, c.name, c.phone, c.email ?? "", c.note ?? ""])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 26 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, ws, "연락처");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ─────────────────────────────────────────────────────────────────────────────
//  조직·연락처 엑셀 양식 다운로드 / 일괄 업로드 파서 (SheetJS)
//  컬럼: 구분 · 실무반/기관 · 부서명 · 직위 · 이름 · 전화번호 · 이메일 · 비고
//  구분은 부산 풍수해 매뉴얼 재대본 편성(지휘부 · 실무반(협업기능반) · 유관기관) 을 따른다.
// ─────────────────────────────────────────────────────────────────────────────
import * as XLSX from "xlsx";
import type { Contact, ContactInput, OrgType } from "@/lib/types";
import { ORG_TYPE_LABEL } from "@/lib/types";

export const COLUMNS = ["구분", "실무반/기관", "부서명", "직위", "이름", "전화번호", "이메일", "비고"] as const;
type Col = (typeof COLUMNS)[number];

/** 헤더 별칭 — 지자체별로 다른 표기를 흡수 */
const ALIAS: Record<Col, string[]> = {
  구분: ["구분", "조직구분", "분류", "편성", "type", "orgtype"],
  "실무반/기관": ["실무반/기관", "실무반", "기능반", "협업기능반", "기관", "기관명", "반", "실무반명", "unit", "team"],
  부서명: ["부서명", "부서", "소속", "소속부서", "담당부서", "실국", "과", "dept", "department"],
  직위: ["직위", "직급", "직책", "position", "title", "grade"],
  이름: ["이름", "성명", "담당자", "담당자명", "name"],
  전화번호: ["전화번호", "연락처", "휴대폰", "휴대전화", "핸드폰", "전화", "mobile", "phone", "tel"],
  이메일: ["이메일", "메일", "email", "e-mail", "mail"],
  비고: ["비고", "메모", "참고", "note", "remark"],
};

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

export function parseOrgType(v: string): OrgType | undefined {
  const s = norm(v);
  if (!s) return undefined;
  if (/지휘|본부장|command/.test(s)) return "command";
  if (/실무반|기능반|협업기능|team|반$/.test(s)) return "team";
  if (/유관|협업기관|외부|기관|agency/.test(s)) return "agency";
  return undefined;
}
/** 구분 컬럼이 없을 때 부서명으로 추정 */
export function guessOrgType(unit: string, dept: string, position: string): OrgType {
  const s = `${unit} ${dept}`;
  if (/기상청|사단|군부대|공사|KT|적십자|교육청|한전|경찰청|소방/.test(s) && !/반$/.test(unit)) return "agency";
  if (/본부장|차장|총괄조정관|통제관|담당관\(/.test(position)) return "command";
  return "team";
}

/** 숫자만 남기고 000-0000-0000 형태로 정규화 */
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
  row: number;
  data: ContactInput;
  errors: string[];
  warnings: string[];
}
export interface ParseResult {
  rows: ParsedRow[];
  headerMap: Record<string, string>;
  missing: string[];
  sheet: string;
}

/** 업로드 파일(xlsx/xls/csv) → 연락처 행 파싱 + 검증 */
export async function parseContactsFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", codepage: 949 });
  const sheetName = wb.SheetNames.find((n) => /연락처|조직|contacts?/i.test(n)) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
  if (!aoa.length) return { rows: [], headerMap: {}, missing: ["부서명", "이름", "전화번호"], sheet: sheetName };

  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(6, aoa.length); i++) {
    const hits = (aoa[i] ?? []).filter((c) => Object.values(ALIAS).some((al) => al.map(norm).includes(norm(c)))).length;
    if (hits > best) {
      best = hits;
      headerIdx = i;
    }
  }
  const header = (aoa[headerIdx] ?? []).map(norm);
  const colIdx: Partial<Record<Col, number>> = {};
  const headerMap: Record<string, string> = {};
  for (const col of COLUMNS) {
    const idx = header.findIndex((h) => ALIAS[col].map(norm).includes(h));
    if (idx >= 0) {
      colIdx[col] = idx;
      headerMap[col] = String(aoa[headerIdx][idx]);
    }
  }
  const missing = (["부서명", "이름", "전화번호"] as const).filter((c) => colIdx[c] === undefined);

  const rows: ParsedRow[] = [];
  const seenPhone = new Map<string, number>();
  // 병합셀로 비어 있는 구분/실무반은 위 행 값을 이어받는다
  let lastType: OrgType | undefined;
  let lastUnit = "";
  for (let r = headerIdx + 1; r < aoa.length; r++) {
    const line = aoa[r] ?? [];
    const get = (c: Col) => (colIdx[c] === undefined ? "" : String(line[colIdx[c]!] ?? "").trim());
    const dept = get("부서명");
    const position = get("직위");
    const name = get("이름");
    const phone = normalizePhone(get("전화번호"));
    if (!dept && !position && !name && !phone) continue;
    const typeRaw = get("구분");
    let unit = get("실무반/기관");
    let orgType = parseOrgType(typeRaw) ?? (typeRaw ? undefined : lastType);
    if (unit) lastUnit = unit;
    else if (colIdx["실무반/기관"] !== undefined) unit = lastUnit;
    if (!orgType) orgType = guessOrgType(unit, dept, position);
    if (!unit) unit = orgType === "agency" ? dept : orgType === "command" ? "재난안전대책본부 지휘부" : "미배정";
    lastType = orgType;
    const data: ContactInput = { orgType, unit, dept, position, name, phone, email: get("이메일") || undefined, note: get("비고") || undefined };
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!name) errors.push("이름 없음");
    if (!dept) errors.push("부서명 없음");
    if (!phone) errors.push("전화번호 없음");
    else if (phone.replace(/[^0-9]/g, "").length < 8) errors.push("전화번호 형식 오류");
    if (!position) warnings.push("직위 없음");
    if (typeRaw && !parseOrgType(typeRaw)) warnings.push(`구분 「${typeRaw}」 인식 불가 → ${ORG_TYPE_LABEL[orgType]}`);
    if (!typeRaw && colIdx["구분"] === undefined) warnings.push(`구분 추정: ${ORG_TYPE_LABEL[orgType]}`);
    if (data.email && !isValidEmail(data.email)) warnings.push("이메일 형식 확인");
    const key = phone.replace(/[^0-9]/g, "");
    if (key) {
      if (seenPhone.has(key)) warnings.push(`${seenPhone.get(key)}행과 전화번호 중복`);
      else seenPhone.set(key, r + 1);
    }
    rows.push({ row: r + 1, data, errors, warnings });
  }
  return { rows, headerMap, missing, sheet: sheetName };
}

const WIDTHS = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 26 }, { wch: 26 }];

/** 업로드 양식(xlsx) — 「연락처」 시트(헤더+예시) + 「작성안내」 시트 */
export function buildTemplateWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const sample = [
    [...COLUMNS],
    ["지휘부", "재난안전대책본부 지휘부", "시민안전실", "총괄조정관(시민안전실장)", "홍길동", "010-0000-0001", "hong@example.go.kr", "재난상황관리·행정지원 총괄"],
    ["실무반", "재난상황관리반", "재난안전상황실", "상황팀장", "김상황", "010-0000-0002", "kim@example.go.kr", "야간 당직 총괄"],
    ["실무반", "시설응급복구반", "도로안전과", "팀장", "이도로", "051-000-0003", "", "도로 통제"],
    ["유관기관", "부산소방재난본부", "119종합상황실", "상황실장", "박소방", "010-0000-0004", "", "예시 행은 삭제 후 사용"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sample);
  ws["!cols"] = WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, "연락처");

  const guide = [
    ["재난상황일지 생성도구 · 조직·연락처 일괄 업로드 양식"],
    ["부산광역시 풍수해 재난 현장조치 행동매뉴얼의 재난안전대책본부 편성(지휘부 · 13개 협업기능별 실무반 · 유관기관)을 따릅니다."],
    [""],
    ["컬럼", "필수", "설명"],
    ["구분", "권장", "지휘부 / 실무반 / 유관기관 중 하나. 비어 있으면 위 행의 값을 이어받고, 그래도 없으면 부서명으로 추정"],
    ["실무반/기관", "권장", "실무반 이름(예: 재난상황관리반, 시설응급복구반) 또는 기관명(예: 부산소방재난본부, 부산지방기상청). 비어 있으면 위 행의 값을 이어받음"],
    ["부서명", "필수", "실·국·과 등 소속 부서 (예: 자연재난과, 119종합상황실)"],
    ["직위", "권장", "직위·직책 (예: 과장, 팀장, 주무관, 상황실장)"],
    ["이름", "필수", "성명"],
    ["전화번호", "필수", "휴대폰 또는 사무실 번호. 하이픈 없이 입력해도 자동 정리 (SMS 발송 대상)"],
    ["이메일", "선택", "메일 주소 (이메일 전파 대상)"],
    ["비고", "선택", "담당 업무·당직 등 참고"],
    [""],
    ["· 1행(헤더)은 지우지 마세요. 헤더 표기는 「부서/소속」「직급」「성명」「연락처/휴대폰」「기능반/기관명」 등 유사 표기도 인식합니다."],
    ["· 예시 행은 삭제하고 실제 데이터를 입력하세요. 구분·실무반은 병합셀처럼 첫 행에만 적어도 됩니다."],
    ["· 13개 실무반(매뉴얼 붙임 8-5-①): 재난상황관리반, 긴급생활안정지원반, 긴급통신지원반, 시설응급복구반, 에너지기능복구반, 재난자원지원반, 교통대책반, 의료및방역서비스반, 재난현장환경정비반, 자원봉사관리반, 사회질서유지반, 수색구조구급반, 재난수습홍보반"],
    ["· 업로드 시 「추가」「병합(전화번호·이름 기준 갱신)」「전체 교체」 중 선택할 수 있습니다."],
    ["· 업로드한 연락처는 이 브라우저(localStorage)에만 저장되며 외부로 전송되지 않습니다."],
  ];
  const wg = XLSX.utils.aoa_to_sheet(guide);
  wg["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wg, "작성안내");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** 현재 목록 내보내기 (동일 양식) */
export function buildExportWorkbook(contacts: Contact[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const label = (t: OrgType) => ({ command: "지휘부", team: "실무반", agency: "유관기관" })[t];
  const aoa = [[...COLUMNS], ...contacts.map((c) => [label(c.orgType), c.unit, c.dept, c.position, c.name, c.phone, c.email ?? "", c.note ?? ""])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = WIDTHS;
  XLSX.utils.book_append_sheet(wb, ws, "연락처");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

import type { ContactInput } from "@/lib/types";

/** 기본 조직·연락처 Seed (가상 인물 · 예시 번호). 시연·초기 안내용 */
export const SEED_CONTACTS: ContactInput[] = [
  { dept: "재난안전상황실", position: "상황실장", name: "김상황", phone: "010-0000-1001", email: "kim.sh@example.go.kr", note: "재대본 상황총괄" },
  { dept: "재난안전상황실", position: "상황팀장", name: "박당직", phone: "010-0000-1002", email: "park.dj@example.go.kr", note: "야간 당직 총괄" },
  { dept: "재난안전상황실", position: "주무관", name: "이기록", phone: "010-0000-1003", email: "lee.gr@example.go.kr", note: "상황일지 작성" },
  { dept: "안전총괄과", position: "과장", name: "최안전", phone: "010-0000-2001", email: "choi.aj@example.go.kr" },
  { dept: "안전총괄과", position: "팀장", name: "정대응", phone: "010-0000-2002", email: "jung.dy@example.go.kr", note: "주민대피 총괄" },
  { dept: "산림녹지과", position: "과장", name: "강산림", phone: "010-0000-3001", email: "kang.sr@example.go.kr", note: "산불 진화 총괄" },
  { dept: "산림녹지과", position: "산불담당", name: "윤진화", phone: "010-0000-3002", email: "yoon.jh@example.go.kr", note: "산불전문예방진화대 운영" },
  { dept: "하천과", position: "팀장", name: "한하천", phone: "010-0000-4001", email: "han.hc@example.go.kr", note: "하상도로·배수펌프장" },
  { dept: "도로과", position: "팀장", name: "서도로", phone: "010-0000-4002", email: "seo.dr@example.go.kr", note: "도로 통제·제설" },
  { dept: "복지정책과", position: "주무관", name: "오구호", phone: "010-0000-5001", email: "oh.gh@example.go.kr", note: "이재민 구호·임시주거" },
  { dept: "홍보담당관", position: "팀장", name: "신홍보", phone: "010-0000-6001", email: "shin.hb@example.go.kr", note: "재난문자·언론 대응" },
  { dept: "○○소방서", position: "현장지휘팀장", name: "문지휘", phone: "010-0000-7001", note: "유관기관 · 현장 지휘" },
  { dept: "○○경찰서", position: "경비교통과장", name: "노교통", phone: "010-0000-7002", note: "유관기관 · 교통 통제" },
  { dept: "○○산림항공관리소", position: "운항팀장", name: "하헬기", phone: "010-0000-7003", note: "유관기관 · 산불진화헬기" },
];

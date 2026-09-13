# 재난상황일지 생성도구 (disaster-log)

실제재난과 안전한국훈련을 하나의 공통 Core로 처리하는 **재난대응·복구 업무 도구**입니다.
`plan/` 폴더의 요구사항정의서 v0.5(UFR-001~009, 54건) · 사용자 서비스 시나리오 v0.9(S01~S13) · 업무흐름도 v1.0을 기준으로 개발했습니다.

```
업무 시작 → 상황정보(기상특보·AI 요약 / 훈련계획·상황부여) → 관련 문서 파일명 조회 → 문서 선택
→ 조치목록+상세 일괄 수신 → 조치 선택·순서 조정 → UNE SOP 모듈로 기본 순차 Flow 자동구성
→ 상황판단 노드·분기 편집 → 실행본 확정 → 실행·조치결과·SMS·자원 기록 → 상황 이벤트 원장 자동 누적
→ 상황일지 AI 초안 → 결과보고(목차·반영자료) AI 초안 → DOCX / PDF 출력
```

## 실행

```bash
npm install
cp .env.example .env.local   # UNI 계정 입력
npm run dev                   # http://localhost:3000
```

대시보드의 **「부산 풍수해 Seed 불러오기」** 를 누르면 문서 선택 → SOP → 실행 → 상황일지 → 결과보고까지 채워진 예시 업무가 생성됩니다. 「안전한국훈련 Seed」는 상황부여·임무 수신/확인/완료 흐름을 보여줍니다.

## 기술 스택 / 배포

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 16 (App Router) + React 19 + TypeScript | Vercel 배포 친화, 서버 라우트로 외부 API 키 보호 |
| UI/스타일 | **UNE 디자인시스템 `@une-front/react-ui` 0.46 + `@une-front/design-tokens`** 위에 Tailwind CSS v4 | Button·Input·Select·Textarea·Checkbox·Badge·Card·Modal·Tabs·Toast·Header·LnbItem·SegmentedControl·Chip 등 DS 컴포넌트 사용, 색상은 전부 DS 시맨틱 토큰 |
| SOP 캔버스 | @xyflow/react (ReactFlow 12) | 기존 UNE 프론트(protecto-frontend)와 동일 계열 |
| 상태·저장 | zustand + localStorage persist | **DB 없이 동작**. Vercel 무료 배포 가능. 설정 화면에서 JSON 백업/복원 |
| 문서 출력 | **한글(HWPX) · DOCX · PDF(인쇄)** — 모두 브라우저에서 생성 | HWPX 는 `templete/AI 행정문서 템플릿.hwpx` 양식(□ ○ - 개조식) 적용 |

> DB가 필요해지면 `src/store/useAppStore.ts` 의 액션을 API 호출로 바꾸고 Postgres(Vercel Postgres/Neon)를 붙이면 됩니다. 타입은 `src/lib/types.ts` 그대로 사용합니다.

## 디자인시스템 적용 방식 (`src/components/ui/index.tsx`, `src/components/icons.tsx`)

- DS 사양 **1rem = 1px**(`html{font-size:1px}`)을 따르고, Tailwind v4 의 spacing / text / radius / breakpoint / container 스케일을 `globals.css` `@theme` 에서 px 로 재정의해 두 체계를 공존시켰다.
- `@layer properties, theme, base, components, utilities;` 를 먼저 선언하고 DS CSS → Tailwind 순으로 import 한다 (DS 의 `.hidden` 이 앱의 `md:flex` 를 덮는 문제 방지).
- 앱 색상 이름(`brand / navy / ink / sub / line / canvas / ok / warn / danger / purple / lv-*`)은 모두 DS 시맨틱 토큰의 별칭이다.
- DS 에 없는 것은 토큰으로 자체 디자인: 위기경보 배지(관심·주의·경계·심각), 확인상태 배지(DS Badge dot 변형), Stat 타일, SOP 노드(ReactFlow), 이벤트 타임라인. `danger/success` 버튼은 DS primary 버튼에 error/success 서피스 토큰을 덧씌운 것.
- 아이콘은 DS `Icon*` 를 우선 사용하고 배포판(0.46.1)에 없는 `IconNode*`·눈송이만 lucide 로 대체.
- DS 오버레이(Toast/Modal/Select)는 `document` 포털을 쓰므로 `AppShell` 은 클라이언트 마운트 후 렌더한다(SSR 시 빈 배경).

## 보고서·상황일지 편집/출력 (Markdown)

- 상황일지·결과보고 본문은 **Markdown** 이다. AI 초안도 Markdown 으로 생성되고(`## 섹션`, `- ` 불릿, `**굵게**`, GFM 표), 편집 탭에서 직접 수정하며 미리보기(`react-markdown`)로 확인한다.
- 내보내기는 `src/lib/export/markdown.ts`(경량 Markdown 블록 파서) → DOCX(`docx.ts`) / HWPX(`hwpx.ts`) 로 변환한다.
- **HWPX 템플릿**: `public/templates/report-template.hwpx` (= `templete/AI 행정문서 템플릿.hwpx`). 템플릿의 용지·글꼴·문단/글자 모양 ID 를 그대로 쓰고 본문만 재구성한다.

  | Markdown | 행정문서 표현 (템플릿 스타일) |
  |---|---|
  | 제목 / 부제 | 20pt 가운데(charPr 9) / 15pt "보고유형 / 일자 / 작성자"(charPr 8) |
  | `#`, `##` | `1. 제목` 15pt 굵게(charPr 10), 자동 번호 |
  | `###` 이하 | `□ 제목` 굵게(charPr 14, 신규 추가) |
  | 단락 | `□ 내용` 13pt(charPr 7), `**굵게**` 는 charPr 14 |
  | 목록 1단계 / 2단계 / 3단계 | `○` / `-` / `·` |
  | `> 인용` | `<캡션>` 11pt 가운데(charPr 12) |
  | 표 | 템플릿 표 규격(머리행 borderFill 4·charPr 12, 본문 borderFill 3·charPr 13) |

  다른 한글 양식으로 바꾸려면 파일을 교체하고 `hwpx.ts` 상단의 ID 매핑만 맞추면 된다. `hwp-convert`(Markdown→HWPX 범용 생성기)도 의존성에 포함해 두었으나 현재는 템플릿 정합을 위해 자체 생성기를 사용한다.

## 외부 연계

### UNI RAG System (사내) — `src/lib/uni/client.ts`
- `POST /auth/login` → token(30일) 캐시, 401 시 재발급
- `GET /models/` → `available` 모델 중 `UNI_PREFER_MODEL` 계열 선택 (모델명 코드 고정 금지, 비상용 `UNI_FORCE_MODEL`)
- `POST /chat/json` (SSE) → **SOP 자동생성**: `__compn__` 이벤트를 CompnSaveParams 그대로 수신 → ReactFlow 노드/엣지 변환 (원본 모듈 `toLLMCompn/toNode/toEdges` 이식)
- `POST {UNI_CHAT_PATH}` (SSE) → **상황일지·결과보고 초안** (일반 챗)
- `__sources__`(사내 문서 발췌)는 화면에 전달하지 않음 (가이드 7절)
- **접속 불가 시** `UNI_FALLBACK=true` 이면 로컬 규칙 기반 초안 / Seed 기반 SOP 생성으로 자동 대체하고 출처를 `fallback` 으로 표시 (UFR-009-003)

서버 라우트: `/api/uni/health`, `/api/uni/sop`, `/api/uni/chat` — 브라우저에는 토큰이 노출되지 않습니다.

> ⚠️ 이 도구를 만든 환경에서는 사내망(10.20.10.101)에 접속할 수 없어 UNI 실호출은 검증하지 못했습니다. 일반 챗 엔드포인트 경로(`UNI_CHAT_PATH`, 기본 `/chat`)와 응답 토큰 필드는 사내에서 `http://10.20.10.101:8000/openapi.json` 을 확인해 조정하세요. SSE 파서(`src/lib/sop/sse.ts`)는 `text/answer/content/delta/choices[].delta.content` 등 여러 필드를 유연하게 수용합니다.

### T3Q — `src/lib/t3q/adapter.ts` (모의)
실제 T3Q API는 호출하지 않습니다. 역할 경계만 동일한 인터페이스로 구현했습니다.
- `searchDocuments(ctx)` → 관련 문서 **파일명 목록** (관련도·설명 비노출)
- `recommendActions(ctx, selectedDocIds)` → **조치목록 + 상세정보 1회 반환** (조치코드/조치명/단계/담당·지원·협업기관/세부행동/전파대상/필요자원). 필수/선택·선행/후행·분기·다음조치는 반환하지 않음
- `weatherSummary(ctx)` → 기상 MCP 요약 (확인 필요 표시)

### 기존 UNE SOP 자동생성 모듈 — `src/lib/sop/`
`code refactoring/sop-autogen-export` 의 계약을 그대로 사용합니다.
- `compn.ts` — `CompnSaveParams`(PascalCase), `CompnAttrbSaveParams`, `CompnTyCode` 매핑(104005=상황판단 확정, 나머지는 가정 → 실제 코드표로 교체)
- `adapter.ts` — **SOP Autogen Adapter**: 선택·정렬된 조치 → 시작/Process/종료 노드 순차 연결, 전파대상이 있으면 하위 임무에 전파(SMS) 속성, 필요자원 임무 추가. 상황판단·분기는 자동 생성하지 않음(사용자 편집). 근거문서·페이지·조치코드는 노드에 넣지 않음
- `converters.ts` — `toNode / toEdges` (원본 AiGenerateButton.tsx 이식) + 실행 순서·분기 진행 유틸
- `sse.ts` — SSE 파싱 규칙(data: 접두, 공백 1개 트림, [DONE])
- SignalR 릴레이 대신 Vercel 친화적인 **SSE 직접 릴레이**(`/api/uni/sop`)로 치환

## Seed 데이터
- `src/data/flood_actions.json` — 부산광역시 풍수해 현장조치 행동매뉴얼(2026.7) 행동요령 카드 **113건** 자동 추출 (징후감지 24 · 초기대응 26 · 비상대응 27 · 수습복구 36). 개인 연락처는 포함하지 않음
- `src/lib/seed/wildfire.ts` — 환경부 산불 실무매뉴얼(2024) 10건 (교차검증)
- `src/lib/seed/documents.ts` — 관련 문서 파일명 목록, `weather.ts` — 기상특보 모의, `templates.ts` — 상황일지 템플릿·결과보고 목차·반영자료 항목

## 화면 ↔ 요구사항 매핑

| 화면(탭) | 시나리오 | 요구사항 |
|---|---|---|
| 대시보드 / 새 업무 시작 | S01 | UFR-001-001~006 |
| 상황·기상·상황부여 | S02 | UFR-001-004/007, UFR-002-001~003 |
| 문서·조치 선택 | S03~S06 | UFR-003-001~003, UFR-004-001~005 |
| SOP 구성·편집 (AI 생성 포함) | S07~S08 | UFR-004-006~009 |
| 실행·조치결과 (SMS·자원·임무·분기) | S09~S11 | UFR-005-001~010, UFR-006-001~006 |
| 상황일지 (이벤트 원장·AI 초안·확정·출력) | S12 | UFR-007-001~005 |
| 결과보고 (목차·반영자료·AI 초안·DOCX/PDF) | S13 | UFR-008-001~007 |
| 출처·확인상태·변경이력·장애 대체·Seed 비종속 | 공통 | UFR-009-001~004 |

## 폴더

```
src/app                 페이지·API 라우트 (/, /situations/new, /situations/[id], /manuals, /settings, /api/uni/*)
src/components          ui(공통) · layout(AppShell) · sop(캔버스·노드) · situation(탭 6종)
src/lib/types.ts        도메인 타입
src/lib/sop             기존 SOP 모듈 계약·어댑터·변환·SSE
src/lib/uni             UNI 클라이언트(서버)·프롬프트·대체 생성
src/lib/t3q             T3Q 어댑터(모의)
src/lib/seed            Seed 데이터
src/store               zustand 스토어(이벤트 원장 자동 누적)
src/lib/export/docx.ts  DOCX 출력
```

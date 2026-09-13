# PROGRESS — 재난상황일지 생성도구 (disaster-log)

> 다른 PC 에서 이어서 작업하기 위한 인수인계 문서. 최신 상태 기준일 **2026-09-14 새벽** (커밋 `915fa20` 이후).
> Claude Code 로 이어서 작업할 때는 이 파일과 `disaster-log/README.md` 를 먼저 읽게 하면 된다.

## 1. 현재 상태 한 줄

프로토타입 기능 완성 · 사내 디자인시스템 적용 · Vercel 운영 배포 중(https://une-report3.vercel.app) · 기획문서 개발 반영본(v0.7/v1.1/v1.2) 작성 완료. 남은 것은 실검증(한컴 HWPX, UNI 사내망, iOS 실기기)과 지자체 실 데이터 반영.

## 2. 저장소 · 배포

| 항목 | 값 |
|---|---|
| GitHub | https://github.com/jazzsalle/une_report3 (**공개 저장소** — 비공개 전환 검토 필요) |
| 앱 위치 | `disaster-log/` (모노레포 하위, Vercel Root Directory = `disaster-log`) |
| Vercel | 프로젝트 `une-report3` · framework nextjs(`vercel.json`) · main 푸시 시 자동 배포 |
| 운영 URL | https://une-report3.vercel.app |
| 스택 | Next.js 16 · React 19 · Tailwind v4 · `@une-front/react-ui` 0.46.1 · zustand(localStorage, DB 없음) · @xyflow/react · SheetJS · qrcode |

## 3. 회사 PC 에서 시작하기

```bash
git clone https://github.com/jazzsalle/une_report3.git
cd une_report3/disaster-log
npm install
cp .env.example .env.local     # 아래 값 채우기
npm run dev                    # http://localhost:3000
```

`.env.local` 에 넣을 값 (비밀값은 저장소에 없음):

- `UNI_BASE_URL=http://10.20.10.101:8000` · `UNI_ACCOUNT` · `UNI_PASSWORD` — 사내 UNI RAG 계정(사업기획팀 공용 계정). 사내망에서만 접속됨.
- `UNI_PREFER_MODEL=qwen` · `UNI_CHAT_PATH=/chat`(가정, 미검증) · `UNI_SOP_PATH=/chat/json` · `UNI_FALLBACK=true`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Vercel 대시보드 → une-report3 → Settings → Environment Variables 의 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 값을 복사(코드는 두 이름 모두 인식). 없으면 현장 응답 저장소가 프로세스 메모리로 동작(로컬 시연은 문제 없음).

Vercel 은 `UNI_*` 8개 + Upstash 마켓플레이스 연동(`KV_*`)이 이미 등록되어 있음. Vercel 서버는 사내망(10.20.10.101)에 도달하지 못해 **운영은 항상 UNI 대체모드**.

## 4. 화면 · 모듈 지도

| 화면 | 경로 | 핵심 파일 |
|---|---|---|
| 대시보드 | `/` | `src/app/page.tsx` |
| 새 업무 시작 | `/situations/new` | `src/app/situations/new/page.tsx` |
| 업무(탭 6개) | `/situations/[id]?tab=overview·docs·sop·run·log·report` | `src/components/situation/*Tab.tsx` |
| SOP 라이브러리 | `/sops`, `/sops/[id]` | `src/app/sops/**`, `NodePanel`은 `SopTab.tsx` 에서 export |
| 조직·연락처·전송그룹 | `/settings/org` | `src/app/settings/org/page.tsx`, `src/lib/org/excel.ts`, `src/components/org/ContactPicker.tsx` |
| 상황전파 발송 | 실행 탭 조치 카드 | `src/components/situation/DispatchModal.tsx` |
| 현장 모바일 응답 | `/m/[token]` | `src/app/m/[token]/page.tsx`, `src/components/dispatch/MobileDispatchView.tsx` |
| 응답 API | `/api/dispatch`, `/api/dispatch/[token]`, `/api/dispatch/pull` | `src/lib/dispatch/server-store.ts`(메모리/Upstash), `useDispatchSync.ts` |
| UNI 연계 | `/api/uni/{health,sop,chat}` | `src/lib/uni/{client,prompts,fallback}.ts` |
| 시연모드 | 헤더 버튼 | `src/components/demo/DemoPanel.tsx`, `src/lib/demo/scenario.ts`, `src/store/useDemoStore.ts` |
| 내보내기 | 상황일지·결과보고 탭 | `src/lib/export/{markdown,hwpx,docx,build}.ts`, 템플릿 `public/templates/report-template.hwpx` |
| 상태 저장 | localStorage `disaster-log-store-v1` | `src/store/useAppStore.ts`, 타입 `src/lib/types.ts` |
| 캔버스 | ReactFlow | `src/components/sop/{SopCanvas,SopNodeView,SopEdgeView,SidePanel}.tsx` |

## 5. 확정된 설계 결정 (되돌리지 말 것)

- **T3Q 실 API 미사용** → `src/lib/t3q/adapter.ts` Mock(동일 인터페이스). AI 는 사내 **UNI RAG**: SOP `/chat/json` SSE(`__status__/__compn__/__done__`), 초안은 일반 챗. 접속 불가 시 circuit breaker(60초) + 규칙 기반 대체 생성.
- 기존 UNE SOP 자동생성 모듈 계약 유지: `CompnSaveParams`(PascalCase), `CompnTyCode` 104001~104006, `DffTyCode` 000000/100001. SignalR → SSE 직접 릴레이.
- **SOP 라이브러리 = 편집(초안/게시) / 상황 실행본 = 배포 스냅샷** 분리.
- **조직 3계층**: 구분(지휘부 · 13개 협업기능별 실무반 · 유관기관) → 실무반·기관 → 부서 → 사람. 부산 풍수해 매뉴얼 p.19·붙임 8-5-①(p.157~158)·p.23 확인 후 결정. **주관/지원/협업은 조치별 역할**(SOP 노드 `leadDept/supportDept/coopAgencies`)이고 상황전파 시 「조치 담당 추천」에만 사용.
- 상황전파: 채널 SMS·이메일(노드 속성) → 발송은 **모의**(링크·QR·문안 생성). 모바일 페이지는 **인증 없음**, payload 는 링크 `?p=` base64url. 응답은 서버(Upstash) + BroadcastChannel.
- 보고서·상황일지 본문은 Markdown. HWPX 는 `templete/AI 행정문서 템플릿.hwpx` 스타일 ID 매핑 자체 생성기.
- **HWPX 주의**: 한컴은 charPr/paraPr 를 **목록 순서**로 해석 → 새 모양은 header.xml 목록 **끝에** 추가(굵은 본문 14, 내어쓰기 paraPr 22·23·24 = □/○/-).
- DS 사양 1rem=1px → Tailwind 스케일 px 재정의, `@layer properties, theme, base, components, utilities;` 선언 후 DS CSS → Tailwind 순 import. DS 오버레이가 document 포털 → AppShell 은 마운트 후 렌더. DS Switch 는 `value/setValue`.
- 화면 용어 도움말은 `Help`(DS Tooltip) 컴포넌트. UI 는 `src/components/ui/index.tsx` 어댑터·`icons.tsx` 경유, 색은 DS 토큰 별칭만.

## 6. 미검증 · 확인 필요 (우선순위 순)

1. **HWPX 한컴 실제 열기** — 915fa20 에서 서식 어긋남(순서 문제) 수정 후 아직 한컴에서 미확인. 결과보고 탭 → HWPX 로 새로 내보내 제목 20pt 견고딕·부제 15pt 명조·장제목 15pt 굵게·□○- 내어쓰기 확인.
2. **UNI 실호출** — 사내망에서 `npm run dev` 후 설정 › 연계상태(또는 `/api/uni/health`)로 연결 확인. `UNI_CHAT_PATH=/chat` 가 맞는지 스웨거로 확인 → 다르면 `.env.local` 만 수정.
3. **iPhone·Safari 실기기** — 모바일 페이지는 표준 CSS 만 사용, 갤럭시 폭(390px)은 자동 검증 완료.
4. 지자체 실 재대본 편성표·연락망 엑셀 → 조직·연락처 일괄 업로드로 Seed 교체.
5. GitHub 저장소 비공개 전환 · Upstash 토큰은 채팅에 노출된 적 있어 시연 후 재발급 권장.
6. SMS·메일 실발송(UNE SMS 모듈) · KRMS 연계는 자리만 있음(계획).

## 7. 검증 스크립트 (Python Playwright)

`disaster-log/scripts/verify/` 에 있음. `pip install playwright openpyxl && playwright install chromium` 후:

```bash
cd disaster-log && npm run build && npx next start -p 3100
python scripts/verify/verify_v2.py http://localhost:3100    # 시연 14단계·도움말·패널·조직 엑셀·SMS 피커
python scripts/verify/verify_v3.py http://localhost:3100    # 조직 Seed·그룹·업로드·시연 15단계·상황전파→모바일 응답→반영
python scripts/verify/verify_hwpx.py http://localhost:3100  # 플로우 확대/자동 이동 + HWPX 구조(charPr 순서·내어쓰기)
python scripts/verify/build_req_v07.py                       # 요구정의서 v0.7 xlsx 재생성 (plan/exel style.xlsx 서식)
```

운영 URL 을 인자로 주면 Vercel 도 같은 검증이 된다. Windows 콘솔은 `set PYTHONIOENCODING=utf-8`.

## 8. 기획문서

`plan/` : 요구정의 v0.7(xlsx, 74건 · 미결협의 시트) · 시나리오 v1.1(html) · 흐름도 v1.2(html) — 개발 반영본. 이전판 `plan/_이전버전/`. `plan/exel style.xlsx` 는 서식 참조용(미커밋). 매뉴얼 PDF 2종은 용량으로 미커밋(로컬 `plan/`).

## 9. 작업 이력 요약 (최근 순)

- `915fa20` 실행 플로우 확대·자동 이동, 노드 펄스/halo·연결선 흐르는 점, HWPX 서식 순서 수정·내어쓰기
- `781351a` 기획문서 v0.7/v1.1/v1.2
- `9f0e1e7` `9206e6e` 조직 3계층·전송그룹·상황전파 모바일 응답·Upstash
- `cb63586` 시연모드·실행 탭 안내창·세부행동 체크·조직 연락처(1차)·SOP 패널 조절
- 이전: DS 전면 적용, SOP 라이브러리, HWPX/DOCX/PDF, Vercel 404 수정(Root Directory·framework)

## 10. 알려진 도구 함정 (Claude Code 로 작업 시)

- Bash 도구 heredoc 은 백슬래시 한 단계를 먹는다(`\n` 이 실제 줄바꿈으로 들어감) → 이스케이프가 있는 코드는 Write/Edit 도구로.
- 파일마다 CRLF/LF 혼재 → 문자열 치환 시 줄바꿈 확인.
- Playwright 스크립트 출력은 UTF-8 지정 필요.

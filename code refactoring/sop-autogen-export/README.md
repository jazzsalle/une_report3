# SOP 자동생성(AI) 기능 — 소스코드 발췌

> 진입점: `SopManageController.GetLLMSopFlowChart`
> 발췌 기준일: 2026-08-26

사용자가 자연어로 상황을 설명하면 외부 LLM 서비스가 SOP 플로우차트 컴포넌트를 생성하고,
그 결과가 **SSE → SignalR 릴레이**를 통해 프론트엔드 캔버스에 실시간으로 한 노드씩 그려지는 기능이다.

---

## 1. 전체 흐름

```
[브라우저]                    [FoundationService(.NET)]                [외부 LLM 서버]
    │                                   │                                    │
    │ ① POST /api/sop/manage/llmflowchart                                    │
    │    body: "자연어 쿼리"(JSON string)                                     │
    ├──────────────────────────────────►│                                    │
    │                                   │ ② POST {BaseUrl}/chat/json         │
    │                                   │    Accept: text/event-stream       │
    │                                   ├───────────────────────────────────►│
    │                                   │                                    │
    │                                   │ ③ 응답 "헤더"만 수신                │
    │                                   │◄───────────────────────────────────┤
    │                                   │   (HeaderTimeoutSeconds=60s 내)     │
    │                                   │                                    │
    │ ④ 200 OK { groupNm, resultMessage }│                                    │
    │◄──────────────────────────────────┤  ※ 본문 수신 전에 즉시 반환          │
    │                                   │  ※ SSE 본문 파싱은 백그라운드 큐로 이관│
    │                                   │                                    │
    │ ⑤ SignalR 연결 후 invoke("AddGroup", groupNm)                          │
    ├──────────────────────────────────►│                                    │
    │                                   │ ⑥ SSE 본문 스트리밍 (라인 단위)      │
    │                                   │◄───────────────────────────────────┤
    │ ⑦ SendMessageToGroup(groupNm, …)  │    data: {"__status__": "..."}      │
    │◄──────────────────────────────────┤    data: {"__compn__": {...}}       │
    │   subject: LLMStatus / LLMCompn   │    data: [DONE]                     │
    │   → 캔버스에 노드/엣지 실시간 추가  │                                    │
```

### 핵심 설계 포인트
| 포인트 | 내용 |
|---|---|
| **동기/비동기 분리** | HTTP 요청은 LLM 응답 **헤더** 수신까지만 동기 대기(성공 판정) → `groupNm` 즉시 반환. 본문(SSE) 파싱은 `IBackgroundTaskQueue`로 넘겨 백그라운드에서 처리. |
| **그룹 격리** | 요청마다 `SOE-{Guid:N}` 형식의 고유 SignalR 그룹명 발급 → 동시 요청 간 메시지 충돌 없음. |
| **타임아웃 전략** | `HttpClient.Timeout = InfiniteTimeSpan`(본문 스트리밍용) + 별도 linked CTS로 헤더 수신에만 타임아웃 적용. |
| **에러 격리** | 백그라운드 예외는 절대 밖으로 throw 하지 않고 `OnLLMError`/`Error` 이벤트로 푸시. `SafeSendAsync`는 그룹이 비어도 무시. |
| **UI 잠금** | 생성 중(`isLlmGenerating`)에는 툴바·리모콘·단축키·캔버스 드래그를 전부 비활성화하여 사용자 조작과 충돌 방지. |
| **되돌리기** | 생성 시작 전 `takeSnapshot()` → 정지 버튼 클릭 시 `onUndo()`로 이전 캔버스 복원. |

---

## 2. SSE 이벤트 계약 (외부 LLM 서버 → FS)

각 라인은 `data: {json}` 형식. `[DONE]` 수신 시 종료.

| SSE 키 | 의미 | SignalR 전달 여부 |
|---|---|---|
| `__status__` | 진행 단계 (`searching` / `reranking` / `generating` / `end`) | ✅ `LLMStatus` |
| `__compn__` | 생성된 SOP 컴포넌트(노드) 1건 | ✅ `LLMCompn` |
| `__thinking__` | LLM 추론 텍스트 | ✅ `LLMThinking` (프론트 미사용) |
| `__sources__` | RAG 출처 목록 | ❌ 주석 처리(전달 제외) |
| `__done__` | 생성 완료 메타(filename, count) | ❌ 주석 처리(전달 제외) |
| `__error__` | 외부 서비스 보고 오류 | ✅ `Error` |

## 3. SignalR 메시지 계약 (FS → 브라우저)

허브: `/oms-hub` · 메서드: `SendMessageToGroup(user, message)`
`message`는 JSON 문자열이며 프론트에서 `JSON.parse` 후 `subject`로 분기한다.

```jsonc
{
  "subject": "LLMStatus",              // 또는 "LLMCompn"
  "action":  "generating"              // LLMCompn일 때는 컴포넌트 JSON 문자열
}
```

`LLMCompn`의 `action` 페이로드 = `CompnSaveParams` (PascalCase):
`CompnSn`, `EndCompns[]`, `CompnGroupSn`, `CompnTyCode`, `CompnSj`,
`CompnCrdnt{X,Y}`, `Width`, `Hg`, `AtmcProgrsYn`, `CharstSort`, `FontSize`, `Color`,
`CompnAttrbSaveParamsList[]`(하위 임무)

---

## 4. 파일 목록

### backend/ — `protectofoundationservice` (.NET 10)

| 파일 | 원본 경로 | 비고 |
|---|---|---|
| `01_SopManageController.excerpt.cs` | `Controllers/SOP/Edit/SopManageController.cs` | **진입점** `GetLLMSopFlowChart` (L404~426) |
| `02_SopEditService.LLM.excerpt.cs` | `Services/SOP/Edit/SopEditService.cs` | **핵심 로직** (L1483~1773)<br>`GetLLMSopFlowChartAsync` / `ProcessLLMSopStreamAsync`(SSE 파서) / `DispatchSseEventAsync`(이벤트 분기) / `SafeSendAsync` / `DeserializeLlmCompn` / `LlmCompnDto` |
| `03_LLMSopFlowChartResponse.cs` | `Models/Responses/` | 응답 DTO (전문) |
| `04_LLMSopServiceSettings.cs` | `Models/Settings/` | 설정 바인딩 클래스 (전문) |
| `05_Program.cs.excerpt.cs` | `Program.cs` | DI 등록 (설정/큐/HttpClient/허브 매핑) |
| `06_appsettings.LLMSopService.excerpt.json` | `appsettings.json` | `LLMSopService.BaseUrl` / `HeaderTimeoutSeconds` |
| `07_HubPublisherService.cs` | `Services/Hubs/` | SignalR 푸시 퍼블리셔 (전문, `GroupName.SOE` 포함) |
| `08_ProtectoHub.cs` | `Services/Hubs/` | SignalR 허브 (`AddGroup` 등, 전문) |
| `09_IBackgroundTaskQueue.cs` | `Services/` | 백그라운드 큐 인터페이스 (전문) |
| `10_DefaultBackgroundTaskQueue.cs` | `Services/` | Channel 기반 구현 (전문) |
| `11_QueuedHostedService.cs` | `Services/` | 큐 소비 HostedService (전문) |

> 07~11은 이 기능이 **의존하는 공용 인프라**로, 기능 전용 코드는 아니지만 동작 이해에 필요해 함께 포함했다.

### frontend/ — `protecto-frontend` (React 18 + TS)

| 파일 | 원본 경로 | 비고 |
|---|---|---|
| `01_useLLMSignalR.ts` | `src/Hooks/ProtectoHooks/useLLMSignalR.ts` | **전용 훅**(전문). SignalR 연결·그룹 가입·`LLMStatus`/`LLMCompn` 수신 |
| `02_AiGenerateButton.tsx` | `src/Components/Pages/sop-edit/main/ReactFlow/components/ToolbarBox/AiGenerateButton.tsx` | **메인 UI**(전문). 모달·입력·상태 애니메이션·API 호출·수신 데이터 → ReactFlow 노드/엣지 변환 |
| `03_SopManage.api.excerpt.js` | `src/API/SopManage.js` | `SOP_MANAGE_API.LLM_FLOWCHART` 엔드포인트 정의 |
| `04_SopReactFlow.slice.excerpt.ts` | `src/Features/SopReactFlow/slice.ts` | `isLlmGenerating` / `llmStopSignal` 상태·리듀서 |
| `05_ToolbarBox.index.excerpt.tsx` | `.../ToolbarBox/index.tsx` | AI 생성 버튼 배치 + 생성 중 툴바 비활성화 |
| `06_SopEditPage.badge.excerpt.tsx` | `src/Components/Pages/sop-edit/main/index.tsx` | 캔버스 좌상단 "AI SOP 생성 중" 뱃지 + 정지 버튼 |
| `07_llm-generating-guards.excerpt.tsx` | 4개 파일 | 생성 중 수동 편집 차단(캔버스/리모콘/핸들 메뉴/단축키) |

---

## 5. 프론트엔드 데이터 변환 체인

`02_AiGenerateButton.tsx` 안의 3개 순수 함수가 백엔드 페이로드를 ReactFlow 형식으로 변환한다.

```
LLMCompnData (PascalCase, 백엔드 DTO)
   └─ toLLMCompn()  → SopCompnInternal (camelCase 내부 표현)
        ├─ toNode()  → NodePT  (shape 노드 + properties + subMissions + arrows + ui)
        └─ toEdges() → EdgePT[] (endCompns 기반 엣지, 존재하는 노드만 연결)
```

수신할 때마다 `compnsRef.current`에 누적 → `setNodes`/`setEdges` 디스패치 → 캔버스 실시간 갱신 →
`fitView`로 자동 화면 맞춤.

---

## 6. 주의사항 / 인수인계 메모

1. **외부 LLM 서버는 이 저장소에 없다.** `appsettings.json`의
   `LLMSopService.BaseUrl = http://221.147.100.161:8000` (하드코딩 IP)로 지정된 별도 서비스이며,
   `POST /chat/json` 엔드포인트가 SSE로 응답하는 계약만 정의되어 있다.
   → 배포 환경별로 반드시 재설정 필요(현재 평문 커밋 상태).
2. **권한명 불일치**: 컨트롤러는 `[DeclareAction("GetLLMFlowChart", …)]`로 권한을 선언하는데,
   프론트 API 정의(`SopManage.js`)의 `AUTH`는 `"SopManage:SaveFlowchart"`로 되어 있다.
   현재 프론트에서 이 AUTH를 `checkAction`으로 검사하는 곳은 없어 동작에는 영향 없으나 정리 대상.
3. **취소가 서버까지 전파되지 않는다.** 프론트 "정지"는 SignalR 그룹 이탈 + Undo만 수행하며,
   백그라운드 SSE 소비는 앱 lifetime 토큰으로 끝까지 진행된다. 필요 시 서버 측 취소 채널 추가 검토.
4. **예외 타입**: `SopEditService`에서 `TimeoutException`/`HttpRequestException` 대신
   범용 `Exception`을 throw하도록 주석 처리되어 있다(원본 코드의 주석 참고). 컨트롤러가
   전부 `catch (Exception)` → `BadRequest`로 처리하므로 클라이언트는 항상 400을 받는다.
5. **한글 인코딩**: 발췌 파일은 원본 인코딩(UTF-8) 그대로 복사했다.

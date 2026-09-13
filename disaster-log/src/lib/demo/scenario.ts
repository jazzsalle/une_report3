"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  자동 시연 시나리오 — 산불(경북 안동·의성) 실제재난 대응 전 과정
//  각 단계는 (1) 화면 이동 (2) 필요한 데이터 조작을 수행하고, 패널에는 설명(내레이션)을 보여준다.
//  「이전」은 화면만 되돌리고 데이터는 되돌리지 않는다 (시연 흐름 보존).
// ─────────────────────────────────────────────────────────────────────────────
import { useAppStore } from "@/store/useAppStore";
import { mockT3Q } from "@/lib/t3q/adapter";
import { mockWeatherAlerts } from "@/lib/seed/weather";
import { seedTemplates } from "@/lib/demo";
import { SEED_CONTACTS } from "@/lib/seed/contacts";

export interface DemoCtx {
  situationId?: string;
  setSituation(id: string): void;
}

export interface DemoStep {
  id: string;
  /** 패널 제목 */
  title: string;
  /** 화면 상단 탭/메뉴 위치 안내 */
  where: string;
  /** 발표자 내레이션 (지자체 담당자에게 설명하는 말투) */
  narration: string;
  /** 화면에서 짚어 줄 포인트 */
  points?: string[];
  /** 이 단계에서 사용자가 직접 눌러보면 좋은 것 */
  tryIt?: string;
  /** 이동할 경로 */
  href(ctx: DemoCtx): string;
  /** 데이터 조작 (선택) — 이동 전에 실행 */
  run?(ctx: DemoCtx): Promise<void> | void;
  /** 이동 후 실행 (화면 이벤트 등) */
  after?(ctx: DemoCtx): Promise<void> | void;
}

export interface DemoScenario {
  id: string;
  name: string;
  subtitle: string;
  steps: DemoStep[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fire = (name: string) => window.dispatchEvent(new CustomEvent(name));

const WILDFIRE_DOCS = ["doc-wildfire-2024", "doc-wildfire-standard"];
const WILDFIRE_CODES = ["가-1", "가-2", "나-1", "나-2", "다-0", "다-2"];

const RESULTS = [
  "13:52 산불발생 접수(의성군 안평면 신안리 야산, 13:40 발화 추정). 도 재난안전상황실·산림청·인접 시군(안동·청송) 전파 완료 — 재난문자 1회, UMS 312명",
  "14:10 상황판단회의 개최(도지사 주재 · 산림·소방·경찰·기상 참여). 초속 8m 북서풍으로 안동 방향 확산 우려 → 산불 위기경보 「주의」→「경계」 격상 결정",
  "14:35 피해현황 1차 집계: 산림 약 35ha 소실 추정, 인명피해 없음, 신안리 주택 2동 위험. 대처상황보고서 1보 행안부·산림청 전파",
  "15:05 안평면 신안리·석탑리 주민 87명 마을회관·초등학교 체육관으로 사전대피 완료. 취약계층 12명 차량 지원",
  "15:40 진화헬기 4대·진화차 6대·산불전문예방진화대 40명 투입, 방화선 구축. 진화율 45%",
  "16:30 주불 진화 완료(진화율 100%). 잔불 정리·뒷불 감시 체제 전환, 야간 감시 인력 20명 배치",
];

function sit(ctx: DemoCtx) {
  const st = useAppStore.getState();
  return ctx.situationId ? st.situations[ctx.situationId] : undefined;
}
function workNodes(ctx: DemoCtx) {
  const s = sit(ctx);
  const active = s?.sopVersions.find((v) => v.id === s.activeSopVersionId);
  if (!s || !active) return [];
  // 실행 순서(엣지 순)대로 작업 노드
  const order: string[] = [];
  const start = active.nodes.find((n) => n.data.kind === "start");
  let cur = start?.id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    order.push(cur);
    const e = active.edges.find((x) => x.source === cur);
    cur = e?.target;
  }
  active.nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n.id); });
  return order.map((id) => active.nodes.find((n) => n.id === id)!).filter((n) => n && n.data.kind !== "start" && n.data.kind !== "end");
}

export const WILDFIRE_SCENARIO: DemoScenario = {
  id: "wildfire",
  name: "산불 대응 시연",
  subtitle: "경북 안동·의성 산불 (실제재난) — 상황 등록 → 문서·조치 → SOP → 실행 → 상황일지 → 결과보고",
  steps: [
    {
      id: "intro",
      title: "시연 시작 · 대시보드",
      where: "좌측 메뉴 › 대시보드",
      narration: "재난상황일지 생성도구는 재난 발생부터 결과보고까지 한 화면 흐름으로 이어 주는 도구입니다. 대시보드에서는 진행 중 업무, SOP 라이브러리, 최근 기록을 한눈에 봅니다. 지금부터 경북 안동·의성 산불 상황을 가정해 전 과정을 따라가겠습니다.",
      points: ["상단 「UNI 연결/대체모드」 배지: AI 서버 연결 상태. 사내망이 아니면 자동으로 대체 생성 모드로 동작", "좌측 「진행 중 업무」: 실행 중인 상황은 ‘실행’ 배지"],
      href: () => "/",
      run: () => {
        seedTemplates();
        const st = useAppStore.getState();
        if (st.contacts.length === 0) st.importContacts(SEED_CONTACTS, "merge");
      },
    },
    {
      id: "new",
      title: "새 업무 시작 화면",
      where: "좌측 메뉴 › 새 업무 시작",
      narration: "업무는 「실제재난」과 「안전한국훈련」 두 모드로 시작합니다. 재난유형·지자체·지역·기준시각·위기경보를 입력하면 이후 문서 조회와 AI 생성에 이 정보가 그대로 쓰입니다. 시연에서는 다음 단계에서 산불 상황을 자동으로 등록합니다.",
      points: ["재난유형: 풍수해(호우·태풍·대설)·산불", "지역은 여러 개 선택 가능(시군구·읍면동)", "훈련 모드에서는 훈련 개요·상황부여 계획을 함께 등록"],
      href: () => "/situations/new",
    },
    {
      id: "create",
      title: "상황 등록 · 기상 확인",
      where: "업무 › 상황·기상 탭",
      narration: "의성군 안평면 야산에서 13시 40분 산불이 발생해 안동 방향으로 확산 중인 상황을 등록했습니다. 기상특보와 기상 요약이 자동으로 붙고, 등록 자체가 첫 원장 기록이 됩니다. 이후 모든 기록은 시각과 함께 이 원장에 쌓여 상황일지의 원천이 됩니다.",
      points: ["기상특보(강풍·건조) 자동 조회 — T3Q 연계 자리(현재는 Seed)", "「확인 필요」 표시: AI·자동 수집 정보는 사용자가 확인 후 확정"],
      href: (c) => `/situations/${c.situationId}?tab=overview`,
      run: async (ctx) => {
        const st = useAppStore.getState();
        const base = new Date();
        base.setMinutes(base.getMinutes() - 140);
        const id = st.createSituation({
          mode: "actual",
          title: `경북 안동·의성 산불 대응 (${base.getMonth() + 1}/${base.getDate()})`,
          disasterType: "wildfire",
          organization: "경상북도",
          baseTime: base.toISOString(),
          regions: [
            { sido: "경상북도", sigungu: "의성군", dong: "안평면 신안리·석탑리" },
            { sido: "경상북도", sigungu: "안동시", dong: "길안면 일원" },
          ],
          currentStatus: "13:40 의성군 안평면 신안리 야산에서 산불 발생. 초속 8m 북서풍으로 안동시 길안면 방향 확산 중. 산불 위기경보 「경계」. 인근 마을 3개 사전대피 검토, 진화헬기 요청.",
          alertLevel: "경계",
        });
        ctx.setSituation(id);
        const alerts = mockWeatherAlerts("경상북도", "wildfire", base.toISOString());
        const summary = await mockT3Q.weatherSummary({ mode: "actual", organization: "경상북도", disasterType: "wildfire", regions: ["의성군", "안동시"], currentStatus: "산불 확산", alertLevel: "경계" }, alerts);
        useAppStore.getState().setWeather(id, alerts, summary);
      },
    },
    {
      id: "docs",
      title: "관련 문서 조회 · 조치 선택",
      where: "업무 › 문서·조치 선택 탭",
      narration: "상황 정보로 관련 매뉴얼을 조회해 「산불 재난 위기대응 실무매뉴얼」 등을 선택했습니다. 선택한 문서에서 조치 카드가 한 번에 내려오고, 담당자는 이번 상황에 필요한 조치만 골라 순서를 정합니다. 여기서 고른 순서가 그대로 SOP 초안이 됩니다.",
      points: ["조치 카드: 단계·담당부서·세부행동·전파대상·필요자원이 매뉴얼에서 자동 입력", "선택 6건: 발생 접수·보고 → 상황판단회의 → 피해현황 → 주민대피 → 진화자원 → 잔불정리"],
      tryIt: "조치 카드를 눌러 세부행동을 펼쳐 보세요",
      href: (c) => `/situations/${c.situationId}?tab=docs`,
      run: async (ctx) => {
        const st = useAppStore.getState();
        const id = ctx.situationId!;
        const c = { mode: "actual" as const, organization: "경상북도", disasterType: "wildfire" as const, regions: ["의성군", "안동시"], currentStatus: "산불 확산 주민대피", alertLevel: "경계" };
        const docs = await mockT3Q.searchDocuments(c);
        st.setRecommendedDocs(id, docs);
        WILDFIRE_DOCS.forEach((d) => { if (docs.some((x) => x.id === d)) useAppStore.getState().toggleDoc(id, d); });
        const actions = await mockT3Q.recommendActions(c, WILDFIRE_DOCS);
        useAppStore.getState().setRecommendedActions(id, actions);
        const picks = WILDFIRE_CODES.map((code) => actions.find((a) => a.code === code)?.id).filter(Boolean) as string[];
        useAppStore.getState().setSelectedActions(id, picks.length ? picks : actions.slice(0, 6).map((a) => a.id));
      },
    },
    {
      id: "sop",
      title: "SOP 자동 구성 · 편집",
      where: "업무 › SOP 구성·편집 탭",
      narration: "선택한 조치가 시작→조치→종료의 순차 Flow 로 자동 그려졌습니다. 노드를 클릭하면 우측 속성 패널에서 담당·세부행동·전파·자원을 수정하고, 「상황판단」 노드를 넣어 조건 분기도 만들 수 있습니다. 속성 패널은 숨기거나 폭을 조절할 수 있어 큰 Flow 도 편하게 봅니다.",
      points: ["기존 UNE SOP 자동생성 모듈의 컴포넌트 계약을 그대로 사용(CompnTyCode·SubMission)", "「AI 생성」: 문장으로 설명하면 UNI RAG 가 SOP 를 그려 줌", "「라이브러리에 저장」: 이 SOP 를 다음 상황에서 재사용"],
      tryIt: "우측 패널 상단 ▸▸ 버튼으로 패널을 숨기고, 패널 왼쪽 가장자리를 드래그해 폭을 바꿔 보세요",
      href: (c) => `/situations/${c.situationId}?tab=sop`,
      run: (ctx) => { useAppStore.getState().buildSopFromSelection(ctx.situationId!); },
    },
    {
      id: "library",
      title: "SOP 라이브러리 — 편집과 실행의 분리",
      where: "좌측 메뉴 › SOP 관리",
      narration: "SOP 는 상황이 없어도 미리 만들어 둘 수 있습니다. 라이브러리에서 초안을 편집하고 「게시」하면 실행 가능한 버전이 되고, 상황이 발생하면 골라서 바로 배포·실행합니다. 배포는 그 시점의 스냅샷이라 이후 라이브러리를 고쳐도 진행 중인 상황은 영향받지 않습니다.",
      points: ["기본 3종: 호우 초기대응 · 태풍 주민 사전대피 · 산불 초동조치", "게시 버전 이력과 어느 상황에 배포됐는지 추적", "JSON 내보내기/가져오기로 지자체 간 SOP 공유"],
      tryIt: "「산불 초동조치 SOP」를 열어 게시 이력을 확인해 보세요",
      href: () => "/sops",
    },
    {
      id: "confirm",
      title: "실행본 확정 · 실행 시작",
      where: "업무 › 실행·조치결과 탭",
      narration: "편집을 마친 SOP 를 「실행본」으로 확정하고 실행을 시작합니다. 시작과 함께 안내창이 뜨고, 시작 노드는 자동 완료되며 첫 조치가 「진행 중」이 됩니다. 좌측은 기준 SOP(목록/플로우), 우측은 현재 조치 처리 화면입니다.",
      points: ["「목록」과 「플로우」 어느 쪽에서든 조치를 클릭해 처리", "실행본만 실행 가능 — 추천 원본·수정본은 잠금", "실행 시작·종료 시 안내창으로 확실히 인지"],
      tryIt: "안내창의 「확인 · 첫 조치로」를 누른 뒤 상단 「플로우」 보기로 바꿔 보세요",
      href: (c) => `/situations/${c.situationId}?tab=run`,
      run: (ctx) => {
        const st = useAppStore.getState();
        st.confirmSop(ctx.situationId!, "시연 실행본 · 상황판단회의 결과 반영");
        useAppStore.getState().startRun(ctx.situationId!);
      },
    },
    {
      id: "checks",
      title: "세부행동 체크 · 조치결과 입력",
      where: "업무 › 실행·조치결과 탭 › 우측 조치 카드",
      narration: "첫 조치 「산불발생 접수·보고·전파」의 세부행동을 하나씩 체크했습니다. 체크마다 시각이 기록되고, 조치결과를 입력해 「완료」하면 다음 조치로 자동 진행됩니다. 조치결과를 비워 두고 완료하면 체크한 세부행동이 결과로 자동 정리됩니다.",
      points: ["세부행동 체크 → 원장에 「세부행동 수행」 기록", "조치결과는 상황일지·결과보고의 핵심 원천", "현장메모는 공식 결과와 구분되어 저장"],
      tryIt: "두 번째 조치를 선택해 세부행동을 직접 체크해 보세요",
      href: (c) => `/situations/${c.situationId}?tab=run`,
      run: async (ctx) => {
        const nodes = workNodes(ctx);
        const first = nodes[0];
        if (!first) return;
        const st = useAppStore.getState();
        (first.data.details ?? []).forEach((_, i) => useAppStore.getState().toggleDetailCheck(ctx.situationId!, first.id, i, true));
        st.updateRun(ctx.situationId!, first.id, { fieldMemo: "야간 발화 대비 산림항공관리소에 헬기 대기 요청" }, { title: `현장메모: ${first.data.title}`, body: "야간 발화 대비 산림항공관리소에 헬기 대기 요청", type: "memo" });
        await sleep(200);
        useAppStore.getState().completeNode(ctx.situationId!, first.id, RESULTS[0]);
      },
    },
    {
      id: "sms",
      title: "상황전파 SMS · 자원 투입",
      where: "업무 › 실행·조치결과 탭 › SMS 발송 · 자원 투입",
      narration: "상황판단회의 조치에서 설정 › 조직·연락처에 등록된 부서·담당자를 골라 SMS 를 발송했고, 진화헬기·진화차·진화대 투입을 자원으로 등록했습니다. 발송이력과 투입자원은 조치에 연결돼 결과보고서의 전파·자원 현황표로 자동 집계됩니다.",
      points: ["수신대상은 조직·연락처(엑셀 일괄 업로드)에서 부서별 선택", "자원 출처: 수기 · 내부 자원목록 · KRMS(연계 예정)", "회수 시각까지 기록해 투입 기간 산출"],
      tryIt: "우측 「SMS 발송」을 열어 조직·연락처에서 부서를 골라 보세요",
      href: (c) => `/situations/${c.situationId}?tab=run`,
      run: async (ctx) => {
        const nodes = workNodes(ctx);
        const n2 = nodes[1];
        if (!n2) return;
        const st = useAppStore.getState();
        const picks = st.contacts.filter((c) => /산림|상황실|안전총괄/.test(c.dept)).slice(0, 6).map((c) => `${c.name} ${c.position}(${c.dept}, ${c.phone})`);
        st.addSms(ctx.situationId!, { nodeId: n2.id, recipients: picks.length ? picks : ["도 재난안전상황실", "산림녹지과", "의성군·안동시 재난담당관"], message: "[경상북도 재대본] 의성 안평면 산불 위기경보 「경계」 격상(14:10). 안동 길안면 방향 확산 우려. 시군 상황실 비상근무 및 주민대피 준비 바랍니다." });
        useAppStore.getState().addResource(ctx.situationId!, { nodeId: n2.id, name: "산불진화헬기", category: "장비", qty: 4, unit: "대", source: "internal" });
        useAppStore.getState().addResource(ctx.situationId!, { nodeId: n2.id, name: "진화차", category: "장비", qty: 6, unit: "대", source: "internal" });
        useAppStore.getState().addResource(ctx.situationId!, { nodeId: n2.id, name: "산불전문예방진화대", category: "인력", qty: 40, unit: "명", source: "internal" });
        (n2.data.details ?? []).forEach((_, i) => useAppStore.getState().toggleDetailCheck(ctx.situationId!, n2.id, i, true));
        await sleep(200);
        useAppStore.getState().completeNode(ctx.situationId!, n2.id, RESULTS[1]);
      },
    },
    {
      id: "change",
      title: "상황 변화 대응",
      where: "업무 › 실행·조치결과 탭 › 상황 변화 대응",
      narration: "15시 20분 강풍으로 안동 방향 확산이 빨라져 위기경보 「심각」 격상을 검토하는 변화를 메모로 남겼습니다. 상황이 커지면 「관련 문서 재조회 · 추가 SOP」로 조치를 보강할 수 있고, 지금까지의 실행 이력은 그대로 유지됩니다. 이어서 피해현황·주민대피·진화자원 조치를 완료했습니다.",
      points: ["「상황 변화 대응」 옆 ? 아이콘에 마우스를 올리면 도움말", "변화 메모는 상황일지에 「입력」 항목으로 자동 반영"],
      href: (c) => `/situations/${c.situationId}?tab=run`,
      run: async (ctx) => {
        const st = useAppStore.getState();
        st.addLedger(ctx.situationId!, { type: "user", title: "상황 변화 기록", body: "15:20 북서풍 초속 10m 로 강화, 안동시 길안면 방향 확산 가속. 위기경보 「경계」→「심각」 격상 검토. 길안면 3개 마을 추가 대피 준비", source: "user", verify: "confirmed" });
        const nodes = workNodes(ctx);
        const mids = nodes.slice(2, Math.max(2, nodes.length - 1));
        for (let i = 0; i < mids.length; i++) {
          const n = mids[i];
          (n.data.details ?? []).forEach((_, k) => useAppStore.getState().toggleDetailCheck(ctx.situationId!, n.id, k, true));
          await sleep(120);
          useAppStore.getState().completeNode(ctx.situationId!, n.id, RESULTS[2 + i] ?? "세부행동 전 항목 수행 완료");
        }
      },
    },
    {
      id: "finish",
      title: "실행 완료",
      where: "업무 › 실행·조치결과 탭",
      narration: "마지막 조치 「잔불 정리·뒷불 감시」를 완료하자 종료 노드에 도달했고 완료 안내창이 떴습니다. 완료·생략 건수, SMS·자원 요약이 함께 보이고, 바로 상황일지 작성으로 넘어갈 수 있습니다.",
      points: ["기준 SOP 대비 실제 수행 시각이 타임라인에 모두 남음", "「실행 재개」로 중지된 실행을 이어갈 수 있음"],
      tryIt: "안내창의 「상황일지 작성으로」 대신 「닫기」를 누르고 「플로우」 보기에서 완료 상태를 확인해 보세요",
      href: (c) => `/situations/${c.situationId}?tab=run`,
      run: async (ctx) => {
        const nodes = workNodes(ctx);
        const st = useAppStore.getState();
        for (const n of nodes) {
          const s = useAppStore.getState().situations[ctx.situationId!];
          const status = s.runs[n.id]?.status;
          if (status === "done" || status === "skipped") continue;
          (n.data.details ?? []).forEach((_, k) => useAppStore.getState().toggleDetailCheck(ctx.situationId!, n.id, k, true));
          await sleep(120);
          useAppStore.getState().completeNode(ctx.situationId!, n.id, RESULTS[5]);
        }
        void st;
      },
    },
    {
      id: "log",
      title: "상황일지 AI 초안",
      where: "업무 › 상황일지 탭",
      narration: "원장에 쌓인 기록을 바탕으로 상황일지 초안을 AI 가 작성합니다. UNI RAG 서버에 연결되면 실제 모델이, 아니면 규칙 기반 대체 생성이 같은 형식으로 만듭니다. 초안은 Markdown 으로 편집·미리보기가 되고, 「확정」 후 한글(HWPX)·Word·PDF 로 내보냅니다.",
      points: ["좌측 원장에서 항목별 「확인/확인 필요/제외」 지정 → 일지에 반영", "생성 출처 배지: UNI 실연동 / 대체 생성", "HWPX 는 templete 폴더의 행정문서 양식을 그대로 사용"],
      tryIt: "「AI 초안 생성」을 다시 눌러 재생성하거나, 본문을 직접 고쳐 보세요",
      href: (c) => `/situations/${c.situationId}?tab=log`,
      after: async () => { await sleep(700); fire("demo:generate-log"); },
    },
    {
      id: "report",
      title: "결과보고서 · 내보내기",
      where: "업무 › 결과보고 탭",
      narration: "결과보고서는 목차(개요·기상·조치·전파·자원·향후계획)별로 AI 가 본문을 채우고, 조치결과·SMS·자원 현황표는 데이터에서 자동 생성됩니다. 실제재난과 훈련은 목차가 다르며, 완성본은 한글 양식(HWPX)으로 바로 내려받아 결재에 올릴 수 있습니다.",
      points: ["섹션별 포함/제외 · Markdown 편집", "HWPX · DOCX · PDF 내보내기", "훈련 모드는 상황부여·임무 수행 현황이 추가"],
      tryIt: "「HWPX 내보내기」를 눌러 한글 문서로 열어 보세요",
      href: (c) => `/situations/${c.situationId}?tab=report`,
      after: async () => { await sleep(700); fire("demo:generate-report"); },
    },
    {
      id: "outro",
      title: "마무리",
      where: "좌측 메뉴 › 대시보드",
      narration: "상황 등록 → 문서·조치 선택 → SOP 구성·실행 → 상황일지 → 결과보고까지, 한 번 입력한 기록이 끝까지 재사용되는 흐름을 보셨습니다. 기존 SOP 자동생성 모듈과 사내 디자인시스템 위에서 동작하며, DB 없이도 배포·운영이 가능합니다. 시연 데이터는 「시연 종료」 후 삭제할 수 있습니다.",
      points: ["요구정의 54개 항목 · 사용자 시나리오 S01~S13 반영", "UNI RAG(SOP·초안) · T3Q(문서·조치·기상) · KRMS(자원) 연계 자리 확보", "다음: 지자체 실 데이터로 매뉴얼 Seed 교체, 사내망에서 UNI 실연동 검증"],
      href: () => "/",
    },
  ],
};

export const SCENARIOS: Record<string, DemoScenario> = { wildfire: WILDFIRE_SCENARIO };

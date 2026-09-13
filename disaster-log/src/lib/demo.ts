"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  데모 Seed — 부산 풍수해 실제재난 1차 검증 시나리오를 한 번에 구성 (UFR-009-004)
//  문서조회 → 조치 수신 → 선택·정렬 → SOP 구성 → 실행·조치결과·SMS·자원 → 원장 누적
// ─────────────────────────────────────────────────────────────────────────────
import { useAppStore } from "@/store/useAppStore";
import { mockT3Q } from "@/lib/t3q/adapter";
import { mockWeatherAlerts } from "@/lib/seed/weather";
import { FLOOD_CORE_CODES } from "@/lib/seed/flood";

export async function createDemoSituation(): Promise<string> {
  const st = useAppStore.getState();
  const base = new Date();
  base.setHours(base.getHours() - 6);
  const id = st.createSituation({
    mode: "actual",
    title: `부산 호우경보 대응 (${base.getMonth() + 1}/${base.getDate()})`,
    disasterType: "flood",
    organization: "부산광역시",
    baseTime: base.toISOString(),
    regions: [
      { sido: "부산광역시", sigungu: "동래구", dong: "온천천 일원" },
      { sido: "부산광역시", sigungu: "사상구", dong: "학장동 저지대" },
      { sido: "부산광역시", sigungu: "해운대구" },
    ],
    currentStatus: "호우주의보가 호우경보로 격상. 온천천 하상도로 침수 시작, 사상구 저지대 주택 침수 우려. 배수펌프장 사전 가동 중.",
    alertLevel: "경계",
  });

  const ctx = { mode: "actual" as const, organization: "부산광역시", disasterType: "flood" as const, regions: ["동래구", "사상구", "해운대구"], currentStatus: "호우경보 침수 대피", alertLevel: "경계" };
  const alerts = mockWeatherAlerts("부산광역시", "flood", base.toISOString());
  const summary = await mockT3Q.weatherSummary(ctx, alerts);
  st.setWeather(id, alerts, summary);

  const docs = await mockT3Q.searchDocuments(ctx);
  st.setRecommendedDocs(id, docs);
  ["doc-busan-flood-2026", "doc-river-safety-2023", "doc-evacuation-order"].forEach((d) => st.toggleDoc(id, d));

  const actions = await mockT3Q.recommendActions(ctx, ["doc-busan-flood-2026", "doc-river-safety-2023", "doc-evacuation-order"]);
  st.setRecommendedActions(id, actions);
  const picks = FLOOD_CORE_CODES.map((c) => actions.find((a) => a.code === c)?.id).filter(Boolean) as string[];
  st.setSelectedActions(id, picks.slice(0, 8));
  st.buildSopFromSelection(id);
  st.confirmSop(id, "데모 시나리오 실행본");
  st.startRun(id);

  // 몇 개 노드 실행·조치결과 입력
  const s = useAppStore.getState().situations[id];
  const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId)!;
  const procNodes = active.nodes.filter((n) => n.data.kind === "process" || n.data.kind === "spread");
  const results = [
    "기상청 호우경보 통보문 접수(NDMS) 후 구·군 상황실 및 재난공무원 UMS 전파 완료(수신 1,240명)",
    "시장·부시장 SMS 보고 및 1장 보고서 대면보고 완료. 상황판단회의 개최 결정",
    "시민 대상 재난문자·전광판·BIT 특보 전파, 유관기관 PS-LTE 단톡방 공유",
    "시민안전실장 주재 상황판단회의 개최(15개 지원부서장, 소방·경찰·53사단 영상 참여). 비상 2단계 결정",
  ];
  procNodes.slice(0, results.length).forEach((n, i) => {
    st.updateRun(id, n.id, { fieldMemo: i === 0 ? "야간 발표로 NDMS·SMS 병행 전파" : undefined });
    st.completeNode(id, n.id, results[i]);
  });

  st.addSms(id, { nodeId: procNodes[2]?.id, recipients: ["구·군 재난담당관 16명", "실·국·본부장", "유관기관 상황실"], message: "[부산광역시 재대본] 호우경보 발효(18:40). 하상도로·지하차도 통제 및 배수펌프장 가동 점검 후 결과 보고 바랍니다." });
  st.addResource(id, { nodeId: procNodes[3]?.id, name: "양수기", category: "장비", qty: 12, unit: "대", source: "internal" });
  st.addResource(id, { nodeId: procNodes[3]?.id, name: "모래주머니", category: "자재", qty: 800, unit: "개", source: "manual" });
  st.addResource(id, { nodeId: procNodes[3]?.id, name: "재해취약지 예찰 인력", category: "인력", qty: 24, unit: "명", source: "internal" });
  st.addLedger(id, { type: "user", title: "온천천 세병교·연안교 하상도로 통제 (동래경찰서 협조)", body: "08:23 세병교, 08:42 연안교 차량 통제 개시", source: "user", verify: "confirmed" });
  st.addLedger(id, { type: "user", title: "사상구 학장동 주택 3세대 침수 신고 접수", body: "구청 현장 확인 중 — 이재민 발생 여부 미확인", source: "user", verify: "unverified" });
  return id;
}

export async function createDemoTraining(): Promise<string> {
  const st = useAppStore.getState();
  const base = new Date();
  const id = st.createSituation({
    mode: "training",
    title: `2026 안전한국훈련 – 부산 태풍 대응 도상훈련`,
    disasterType: "typhoon",
    organization: "부산광역시",
    baseTime: base.toISOString(),
    regions: [{ sido: "부산광역시", sigungu: "해운대구", dong: "마린시티 해안변" }, { sido: "부산광역시", sigungu: "영도구" }],
    alertLevel: "주의",
    training: {
      name: "2026 안전한국훈련(태풍) 부산광역시 도상훈련",
      purpose: "태풍 북상 시 재대본 가동·상황전파·주민대피 절차 숙달 및 유관기관 협업체계 점검",
      scenario: "제12호 태풍이 남해안으로 북상. D-1 태풍예비특보 → 태풍주의보 → 태풍경보 순으로 격상, 해안변 월파·저지대 침수·정전 상황 순차 부여",
      agencies: ["부산소방재난본부", "부산경찰청", "부산지방기상청", "한국전력공사 부산울산본부", "육군 제53사단"],
      schedule: `${base.getFullYear()}.${base.getMonth() + 1}.${base.getDate()} 09:00~12:00`,
    },
  });
  const t = (m: number) => new Date(base.getTime() + m * 60000).toISOString();
  st.addInjection(id, { at: t(0), message: "[상황부여 1] 09:00 기상청 태풍예비특보 발표. 내일 오전 부산 최근접 예상.", target: "재난안전상황실" });
  st.addInjection(id, { at: t(25), message: "[상황부여 2] 09:25 태풍주의보 발효. 마린시티 해안도로 월파 시작.", target: "해운대구, 도로안전과" });
  st.addInjection(id, { at: t(50), message: "[상황부여 3] 09:50 영도구 저지대 정전 1,200세대. 한전 복구반 요청 필요.", target: "미래에너지산업과, 한국전력" });
  const ctx = { mode: "training" as const, organization: "부산광역시", disasterType: "typhoon" as const, regions: ["해운대구", "영도구"], trainingScenario: "태풍 대피 정전", alertLevel: "주의" };
  const alerts = mockWeatherAlerts("부산광역시", "typhoon", base.toISOString());
  st.setWeather(id, alerts);
  const docs = await mockT3Q.searchDocuments(ctx);
  st.setRecommendedDocs(id, docs);
  ["doc-busan-flood-2026", "doc-safe-korea-guide", "doc-evacuation-order"].forEach((d) => st.toggleDoc(id, d));
  const actions = await mockT3Q.recommendActions(ctx, ["doc-busan-flood-2026", "doc-safe-korea-guide"]);
  st.setRecommendedActions(id, actions);
  const picks = ["4-1", "5-2", "6-1", "6-3", "40-1", "40-5"].map((c) => actions.find((a) => a.code === c)?.id).filter(Boolean) as string[];
  st.setSelectedActions(id, picks);
  st.buildSopFromSelection(id);
  st.confirmSop(id, "훈련 실행본");
  st.startRun(id);
  const s = useAppStore.getState().situations[id];
  const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId)!;
  const first = active.nodes.filter((n) => n.data.kind !== "start" && n.data.kind !== "end")[0];
  if (first) {
    st.updateRun(id, first.id, { missionAck: { received: t(3), confirmed: t(6), completed: t(14), by: "재난안전상황실 상황팀장" } }, { title: `임무 수신·확인·완료: ${first.data.title}`, type: "mission" });
    st.completeNode(id, first.id, "태풍예비특보 접수 및 구·군·유관기관 전파 완료(훈련)");
  }
  return id;
}

/** 상황일지 템플릿 (UFR-007-005) */
export const LOG_TEMPLATES = [
  { id: "log-actual-std", mode: "actual", name: "실제재난 상황일지(표준)", description: "일시·상황·조치·전파·자원 시간순 기록" },
  { id: "log-actual-brief", mode: "actual", name: "실제재난 상황일지(간이)", description: "핵심 조치결과 중심 요약형" },
  { id: "log-training-std", mode: "training", name: "안전한국훈련 상황일지", description: "상황부여·임무전파·확인/완료 이력 포함" },
] as const;

export interface TocTemplate {
  id: string;
  mode: "actual" | "training";
  name: string;
  sections: string[];
}

/** 결과보고 목차 템플릿 (UFR-008-001/002) */
export const REPORT_TOC: TocTemplate[] = [
  {
    id: "rpt-actual",
    mode: "actual",
    name: "실제재난 결과보고(기상특보 대처상황 결과보고)",
    sections: ["개요", "기상상황", "피해상황", "대응조치(조치결과)", "상황전파", "재난자원 투입", "응급복구 및 향후계획", "종합 평가"],
  },
  {
    id: "rpt-recovery",
    mode: "actual",
    name: "피해·복구 결과보고",
    sections: ["개요", "피해현황", "응급복구 조치결과", "복구계획", "지원사항", "향후계획"],
  },
  {
    id: "rpt-training",
    mode: "training",
    name: "안전한국훈련 결과보고",
    sections: ["훈련 개요", "훈련계획·시나리오", "상황부여 및 임무전파 경과", "임무 수신·확인·완료 이력", "SOP 대비 실제 수행 비교", "훈련 성과 및 미흡사항", "개선과제"],
  },
];

export const INCLUDE_ITEMS: { key: string; label: string; modes: ("actual" | "training")[] }[] = [
  { key: "results", label: "조치결과", modes: ["actual", "training"] },
  { key: "log", label: "상황일지", modes: ["actual", "training"] },
  { key: "sms", label: "SMS 발송이력", modes: ["actual", "training"] },
  { key: "resources", label: "재난자원 투입", modes: ["actual", "training"] },
  { key: "weather", label: "기상특보·기상요약", modes: ["actual"] },
  { key: "damage", label: "피해·복구", modes: ["actual"] },
  { key: "photos", label: "사진·증빙", modes: ["actual", "training"] },
  { key: "plan", label: "훈련계획·시나리오", modes: ["training"] },
  { key: "injections", label: "상황부여", modes: ["training"] },
  { key: "missions", label: "임무 수신/완료 이력", modes: ["training"] },
];

// ─────────────────────────────────────────────────────────────────────────────
//  기존 UNE SOP 자동생성 모듈 계약 — CompnSaveParams (PascalCase)
//  원본: protectofoundationservice SopEditService.LlmCompnDto / CompnSaveParams
//        protecto-frontend useLLMSignalR.LLMCompnData
// ─────────────────────────────────────────────────────────────────────────────
import type { NodeKind } from "@/lib/types";

export interface CompnArrw {
  CompnSn: number;
  ArrwCn: string | null;
  BeginArrwDrc: string; // 시작 핸들 (예: "bottom")
  EndArrwDrc: string; // 종료 핸들 (예: "top")
}

export interface CompnAttrbSaveParams {
  AttrbSn: number;
  AttrbSj?: string;
  AttrbCn?: string;
  AttrbRm?: string;
  DffTyCode: string; // "000000" = 임무(common), 그 외 = 전파(spread)
  ReceiveOrgnztSns?: number[];
  ReceiveUserSns?: number[];
}

export interface CompnSaveParams {
  CompnSn: number;
  EndCompns: CompnArrw[] | null;
  CompnGroupSn: number | null;
  CompnTyCode: string;
  CompnSj: string;
  CompnCrdnt: { X: number; Y: number };
  Width: number;
  Hg: number;
  AtmcProgrsYn: "Y" | "N";
  CharstSort: string;
  FontSize: number;
  Color: string;
  CompnAttrbSaveParamsList: CompnAttrbSaveParams[];
}

/**
 * CompnTyCode ↔ 노드 유형 키 매핑.
 * 원본 프론트의 getCompnByType 코드표는 발췌에 포함되지 않아 104005(상황판단, label 엣지)만 확정.
 * 나머지는 공통코드 그룹 1040xx 를 가정 — 실제 코드표 확인 후 이 표만 교체하면 된다.
 */
export const COMPN_TY_CODE: Record<NodeKind, string> = {
  start: "104001",
  process: "104002",
  spread: "104003",
  resource: "104004",
  decision: "104005",
  end: "104006",
};

export const CODE_TO_KIND: Record<string, NodeKind> = Object.fromEntries(
  Object.entries(COMPN_TY_CODE).map(([k, v]) => [v, k as NodeKind]),
);

export const DFF_TY_COMMON = "000000";
export const DFF_TY_SMS = "100001";

export const NODE_SIZE: Record<NodeKind, { w: number; h: number }> = {
  start: { w: 160, h: 56 },
  end: { w: 160, h: 56 },
  process: { w: 260, h: 88 },
  spread: { w: 260, h: 88 },
  resource: { w: 260, h: 88 },
  decision: { w: 220, h: 110 },
};

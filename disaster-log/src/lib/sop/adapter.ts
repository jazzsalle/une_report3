// ─────────────────────────────────────────────────────────────────────────────
//  SOP Autogen Adapter — T3Q 조치 상세 → 기존 SOP Component(CompnSaveParams) 변환
//  시나리오 S07 / UFR-004-006, UFR-004-007
//  · 선택·정렬된 조치를 기본 Process 노드로 생성하고 순서대로 순차 연결
//  · 전파대상이 있는 조치는 하위 임무에 전파(SMS) 속성 추가
//  · 상황판단 노드·분기조건은 자동 생성하지 않는다 (사용자 편집 영역)
//  · 근거문서·페이지·조치코드는 노드 설정에 포함하지 않는다
// ─────────────────────────────────────────────────────────────────────────────
import type { RecommendedAction } from "@/lib/types";
import { COMPN_TY_CODE, DFF_TY_COMMON, DFF_TY_SMS, NODE_SIZE, type CompnAttrbSaveParams, type CompnSaveParams } from "./compn";

const COL_X = 120;
const GAP_Y = 150;
const START_Y = 40;

let attrbSeq = 1;

function attrb(title: string, content: string, dff: string, note = ""): CompnAttrbSaveParams {
  return { AttrbSn: attrbSeq++, AttrbSj: title, AttrbCn: content, AttrbRm: note, DffTyCode: dff, ReceiveOrgnztSns: [], ReceiveUserSns: [] };
}

function spreadMessage(a: RecommendedAction, organization: string): string {
  return `[${organization} 재난안전대책본부] ${a.title} 관련 안내입니다. ${a.summary ? a.summary + "." : ""} 담당: ${a.leadDept}. 관련 부서·기관은 매뉴얼에 따라 조치 후 결과를 보고해 주시기 바랍니다.`;
}

/**
 * 조치 목록(사용자 순서)을 CompnSaveParams 시퀀스로 변환한다.
 * 시작 → 조치1 → 조치2 … → 종료 순차 연결.
 */
export function actionsToCompns(actions: RecommendedAction[], organization: string): CompnSaveParams[] {
  attrbSeq = 1;
  const compns: CompnSaveParams[] = [];
  const total = actions.length;
  const snOf = (i: number) => i + 1; // 1 = start, 2..n+1 = actions, n+2 = end

  compns.push({
    CompnSn: snOf(0),
    EndCompns: total > 0 ? [{ CompnSn: snOf(1), ArrwCn: null, BeginArrwDrc: "bottom", EndArrwDrc: "top" }] : [{ CompnSn: snOf(total + 1), ArrwCn: null, BeginArrwDrc: "bottom", EndArrwDrc: "top" }],
    CompnGroupSn: null,
    CompnTyCode: COMPN_TY_CODE.start,
    CompnSj: "시작",
    CompnCrdnt: { X: COL_X + 50, Y: START_Y },
    Width: NODE_SIZE.start.w,
    Hg: NODE_SIZE.start.h,
    AtmcProgrsYn: "Y",
    CharstSort: "center",
    FontSize: 14,
    Color: "gray",
    CompnAttrbSaveParamsList: [],
  });

  actions.forEach((a, i) => {
    const attrs: CompnAttrbSaveParams[] = [];
    attrs.push(attrb(a.title, a.details.slice(0, 6).join("\n"), DFF_TY_COMMON, a.summary));
    if (a.targets.length > 0) {
      attrs.push(attrb(`상황전파: ${a.targets.join(", ")}`, spreadMessage(a, organization), DFF_TY_SMS, `전파대상: ${a.targets.join(", ")}`));
    }
    if (a.resources.length > 0) {
      attrs.push(attrb("필요자원 확인", a.resources.join(", "), DFF_TY_COMMON, "자원 투입/회수 시각 기록"));
    }
    const isLast = i === total - 1;
    compns.push({
      CompnSn: snOf(i + 1),
      EndCompns: [{ CompnSn: isLast ? snOf(total + 1) : snOf(i + 2), ArrwCn: null, BeginArrwDrc: "bottom", EndArrwDrc: "top" }],
      CompnGroupSn: null,
      CompnTyCode: a.targets.length > 0 && /전파|보고|통보|홍보/.test(a.title) ? COMPN_TY_CODE.spread : COMPN_TY_CODE.process,
      CompnSj: a.title,
      CompnCrdnt: { X: COL_X, Y: START_Y + GAP_Y * (i + 1) },
      Width: NODE_SIZE.process.w,
      Hg: NODE_SIZE.process.h,
      AtmcProgrsYn: "N",
      CharstSort: "left",
      FontSize: 13,
      Color: a.stage === "수습·복구" ? "green" : a.stage === "비상대응" ? "red" : a.stage === "초기대응" ? "orange" : "blue",
      CompnAttrbSaveParamsList: attrs,
    });
  });

  compns.push({
    CompnSn: snOf(total + 1),
    EndCompns: [],
    CompnGroupSn: null,
    CompnTyCode: COMPN_TY_CODE.end,
    CompnSj: "종료",
    CompnCrdnt: { X: COL_X + 50, Y: START_Y + GAP_Y * (total + 1) },
    Width: NODE_SIZE.end.w,
    Hg: NODE_SIZE.end.h,
    AtmcProgrsYn: "Y",
    CharstSort: "center",
    FontSize: 14,
    Color: "gray",
    CompnAttrbSaveParamsList: [],
  });

  return compns;
}

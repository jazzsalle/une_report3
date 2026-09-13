// [발췌] protecto-frontend/src/API/SopManage.js — LLM FlowChart 엔드포인트 (L100~107)
// setAPI("llmflowchart") → POST /api/sop/manage/llmflowchart

const setAPI = (url = "") => `/sop/manage/${url}`;

/** SOP 편집 - SOP 관리 */
export const SOP_MANAGE_API = {
    /** SOP 목록 조회(GET), 등록(POST), 수정(PUT), 삭제(DELETE) */
    BASE: {
        URL: setAPI(),
        KEY: ["sopManage"], //  바꾸기
        GET: {
            KEY: ["SopManage:GET"],
            AUTH: "SopManage:GetList",
        },
    // ... 중략 ...
    /** LLM SOP FlowChart 생성 요청(POST) */
    LLM_FLOWCHART: {
        URL: setAPI("llmflowchart"),
        POST: {
            KEY: ["sopManageLlmFlowchart:POST"],
            AUTH: "SopManage:SaveFlowchart",
        },
    },
};

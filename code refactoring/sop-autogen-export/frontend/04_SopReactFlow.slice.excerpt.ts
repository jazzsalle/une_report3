// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] AI 생성 상태 Redux (초기값 / 리듀서 / 액션 export)
//  원본: protecto-frontend/src/Features/SopReactFlow/slice.ts
// ═════════════════════════════════════════════════════════════════════════════

// ── initialState (L69~70) ───────────────────────────────────────────────
    isLlmGenerating: false, // AI SOP 자동 생성 진행 여부
    llmStopSignal: 0, // 외부에서 생성 정지 트리거 (값 증가 시 정지)

// ── reducers (L611~617) ─────────────────────────────────────────────────
        setIsLlmGenerating: (state, { payload }: { payload: boolean }) => {
            state.isLlmGenerating = payload;
        },

        setLlmStopSignal: (state) => {
            state.llmStopSignal += 1;
        },

// ── actions export (L662~663) ───────────────────────────────────────────
    setIsLlmGenerating,
    setLlmStopSignal,

// ── 타입 정의: protecto-frontend/src/Common/ProtectoUI/ReactFlow/types.ts L145~146
    isLlmGenerating: boolean;
    llmStopSignal: number;

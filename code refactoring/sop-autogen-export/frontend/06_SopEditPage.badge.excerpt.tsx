// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] AI 생성 중 캔버스 뱃지(진행 표시 + 정지 버튼)
//  원본: protecto-frontend/src/Components/Pages/sop-edit/main/index.tsx
//  L18(액션 import), L54(상태 구독), L259~304(뱃지 UI)
//  ※ 정지 버튼은 setLlmStopSignal() 디스패치 → AiGenerateButton이 감지해
//     handleStop() 실행(생성 중단 + Undo로 이전 상태 복원)
// ═════════════════════════════════════════════════════════════════════════════

    setNodeSelected,
    setSelectedEdgeIds,
    setSelectedNodeIds,
    setSidePanelType,
    setLlmStopSignal,
} from "@/Features/SopReactFlow/slice.ts";
import { setAttributeSearchTags } from "@/Features/SopEditMain/SopEditMain";

import "@xyflow/react/dist/style.css";
// ...
    const { nodes, edges, selectedNodeIds, selectedEdgeIds, sidePanelType, isLlmGenerating } =
        useCustomSelector((state) => state.sopreactflow);

// ...
                    {/* AI 자동 생성 중 뱃지 */}
                    {isLlmGenerating && (
                        <Panel position="top-left" style={{ margin: "8px 0 0 8px" }}>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: "var(--primary-500, #3B6FFF)",
                                color: "#fff",
                                borderRadius: 20,
                                padding: "4px 8px 4px 14px",
                                fontSize: 12,
                                fontWeight: 500,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                            }}>
                                <span>
                                    <style>{`
                                        @keyframes badge-text-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                                        @keyframes badge-dot-blink { 0%,80%,100%{opacity:0.3} 40%{opacity:1} }
                                    `}</style>
                                    <span style={{ animation: "badge-text-pulse 1.4s infinite ease-in-out" }}>AI SOP 생성 중</span>
                                </span>
                                <button
                                    onClick={() => dispatch(setLlmStopSignal())}
                                    style={{
                                        background: "rgba(255,255,255,0.25)",
                                        border: "none",
                                        borderRadius: "50%",
                                        width: 20,
                                        height: 20,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        cursor: "pointer",
                                        padding: 0,
                                        color: "#fff",
                                    }}
                                    title="생성 정지 및 이전으로 되돌리기"
                                >
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/>
                                    </svg>
                                </button>
                            </div>
                        </Panel>
                    )}


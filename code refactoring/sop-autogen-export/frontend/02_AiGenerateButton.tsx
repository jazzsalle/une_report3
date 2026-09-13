import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useDispatch } from "react-redux";
import { useReactFlow } from "@xyflow/react";
import {
    Button,
    IconButton,
    IconArrowUp,
    IconStopCircle,
    IconX,
    Textarea,
} from "@une-front/react-ui";

function IconSparkle({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2C10 2 10.8 6.5 13 8.7C15.2 10.9 19 11 19 11C19 11 15.2 11.1 13 13.3C10.8 15.5 10 20 10 20C10 20 9.2 15.5 7 13.3C4.8 11.1 1 11 1 11C1 11 4.8 10.9 7 8.7C9.2 6.5 10 2 10 2Z" fill="currentColor"/>
        </svg>
    );
}

import ToolbarButton from "@/Common/ProtectoUI/ReactFlow/components/ToolbarBox/Button";
import { Box, ModalBasic, Title } from "@/Common/UI";
import { useSOPEdit } from "@/Common/ProtectoUI/ReactFlow/hooks/useSOPEdit";
import { SOP_MANAGE_API } from "@/API";
import { useCustomMutation } from "@/Hooks/ProtectoHooks/Queries/useCustomMutation";
import useCustomSelector from "@/Hooks/ProtectoHooks/Queries/useCustomSelector";
import useToast from "@/Hooks/useToast";
import { setEdges, setNodes, takeSnapshot, setIsLlmGenerating, setLlmStopSignal } from "@/Features/SopReactFlow/slice";
import { getCompnByType } from "@/Common/ProtectoUI/ReactFlow/utils";
import type { EdgePT, NodeColorType, NodePT, NodePTType, NodeTextAlign } from "@/Common/ProtectoUI/ReactFlow/types";
import useLLMSignalR, { LLMAttrbSaveParams, LLMCompnData, LLMStatusAction } from "@/Hooks/ProtectoHooks/useLLMSignalR";

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface SopCompnInternal {
    compnSn: number;
    compnCrdnt: { x: number; y: number };
    width: number;
    hg: number;
    compnTyCode: string;
    compnSj: string;
    atmcProgrsYn: "Y" | "N";
    endCompns: Array<{
        arrwCn: string;
        compnSn: number;
        beginArrwDrc: string;
        endArrwDrc: string;
    }>;
    charstSort?: NodeTextAlign;
    color?: NodeColorType;
    fontSize?: number;
    compnAttrbSaveParamsList?: LLMAttrbSaveParams[];
}

// ─── 변환 유틸 ────────────────────────────────────────────────────────────────

function toLLMCompn(data: LLMCompnData): SopCompnInternal {
    return {
        compnSn: data.CompnSn,
        compnCrdnt: { x: data.CompnCrdnt.X, y: data.CompnCrdnt.Y },
        width: data.Width,
        hg: data.Hg,
        compnTyCode: data.CompnTyCode,
        compnSj: data.CompnSj,
        atmcProgrsYn: data.AtmcProgrsYn as "Y" | "N",
        endCompns: (data.EndCompns ?? []).map((e) => ({
            arrwCn: e.ArrwCn ?? "",
            compnSn: e.CompnSn,
            beginArrwDrc: e.BeginArrwDrc,
            endArrwDrc: e.EndArrwDrc,
        })),
        charstSort: (data.CharstSort || undefined) as NodeTextAlign | undefined,
        color: (data.Color || undefined) as NodeColorType | undefined,
        fontSize: data.FontSize,
        compnAttrbSaveParamsList: data.CompnAttrbSaveParamsList ?? [],
    };
}

function toNode(compn: SopCompnInternal): NodePT {
    return {
        id: String(compn.compnSn),
        type: "shape",
        position: { x: compn.compnCrdnt.x, y: compn.compnCrdnt.y },
        style: { width: compn.width, height: compn.hg },
        data: {
            shape: "detail",
            type: getCompnByType({
                inType: "code",
                outType: "key",
                value: compn.compnTyCode,
            }) as NodePTType,
            properties: {
                title: compn.compnSj,
                autoRun: compn.atmcProgrsYn === "Y",
            },
            subMissions: (compn.compnAttrbSaveParamsList ?? []).map((attr) => ({
                id: attr.AttrbSn,
                title: attr.AttrbSj ?? "",
                type: attr.DffTyCode === "000000" ? "common" : "spread",
                dffTyCode: attr.DffTyCode,
                manager: [],
                recipient: [],
                detail: attr.DffTyCode === "000000" ? (attr.AttrbCn ?? "") : "",
                spreadContent: attr.DffTyCode !== "000000" ? (attr.AttrbCn ?? "") : "",
                note: attr.AttrbRm ?? "",
                reservedCodes: [],
            })),
            arrows: compn.endCompns.map((e) => ({
                title: e.arrwCn,
                nodeId: e.compnSn,
            })),
            ui: {
                charstSort: compn.charstSort,
                color: compn.color,
                fontSize: compn.fontSize ?? 0,
            },
        },
    };
}

function toEdges(compns: SopCompnInternal[]): EdgePT[] {
    const snSet = new Set(compns.map((c) => c.compnSn));
    const edges: EdgePT[] = [];
    for (const compn of compns) {
        for (const e of compn.endCompns) {
            if (!snSet.has(e.compnSn)) continue;
            edges.push({
                id: `xy-edge__${compn.compnSn}${e.beginArrwDrc}-${e.compnSn}${e.endArrwDrc}`,
                source: String(compn.compnSn),
                sourceHandle: e.beginArrwDrc,
                target: String(e.compnSn),
                targetHandle: e.endArrwDrc,
                data: { properties: { type: e.arrwCn || null } },
                ...(compn.compnTyCode === "104005" && { type: "label" }),
            });
        }
    }
    return edges;
}

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<LLMStatusAction, string> = {
    searching: "관련 정보 검색 중",
    reranking: "정보 우선순위 정렬 중",
    generating: "SOP 생성 중",
    end: "생성 완료",
};

const DOT_KEYFRAMES = `
@keyframes llm-dot-blink {
    0%, 80%, 100% { opacity: 0.2; }
    40% { opacity: 1; }
}
@keyframes llm-text-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}
`;

function AnimatedStatusText({ label }: { label: string }) {
    return (
        <>
            <style>{DOT_KEYFRAMES}</style>
            <span style={{ animation: "llm-text-pulse 1.4s infinite ease-in-out" }}>
                {label}
            </span>
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    style={{
                        animation: `llm-dot-blink 1.4s infinite ease-in-out`,
                        animationDelay: `${i * 0.2}s`,
                        opacity: 0.2,
                    }}
                >
                    .
                </span>
            ))}
        </>
    );
}

// ─── 스타일 상수 ──────────────────────────────────────────────────────────────

const S = {
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 20,
    } as React.CSSProperties,
    headerLeft: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    } as React.CSSProperties,
    queryBubble: {
        textAlign: "right" as const,
        marginBottom: 12,
    },
    queryText: {
        display: "inline-block",
        background: "#E8F0FE",
        color: "#1a1a2e",
        padding: "8px 14px",
        borderRadius: "16px 16px 4px 16px",
        fontSize: 14,
        maxWidth: "90%",
        wordBreak: "break-all" as const,
    },
    statusText: {
        color: "#888",
        fontSize: 14,
        padding: "12px 0",
    } as React.CSSProperties,
    previewCard: {
        background: "var(--G_25)",
        border: "1px solid var(--G_100)",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 16,
        color: "var(--G_900)",
    } as React.CSSProperties,
    previewHeader: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: "var(--G_500)",
        marginBottom: 12,
    } as React.CSSProperties,
    stepList: {
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column" as const,
        gap: 8,
    },
    stepItem: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 14,
        color: "var(--G_700)",
    } as React.CSSProperties,
    stepNum: {
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "var(--G_100)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        color: "var(--G_500)",
        flexShrink: 0,
    } as React.CSSProperties,
    previewActions: {
        display: "flex",
        gap: 8,
        marginTop: 16,
        justifyContent: "flex-end",
    } as React.CSSProperties,
    inputRow: {
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
        marginTop: 4,
    } as React.CSSProperties,
};

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function AiGenerateButton() {
    const dispatch = useDispatch();
    const { onShowToast, onErrorToast } = useToast();

    const { nodes, llmStopSignal } = useCustomSelector((state) => state.sopreactflow);

    const [isOpen, setIsOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const [llmStatus, setLlmStatus] = useState<LLMStatusAction | null>(null);
    const [previewCompns, setPreviewCompns] = useState<SopCompnInternal[]>([]);
    const [groupNm, setGroupNm] = useState<string | null>(null);

    const compnsRef = useRef<SopCompnInternal[]>([]);
    const isGenerating = llmStatus !== null && llmStatus !== "end";

    const { onUndo } = useSOPEdit();
    const { fitView } = useReactFlow();

    useEffect(() => {
        if (previewCompns.length === 0) return;
        const raf = requestAnimationFrame(() => {
            fitView({ duration: 300, maxZoom: 1, padding: 0.2 });
        });
        return () => cancelAnimationFrame(raf);
    }, [previewCompns.length]);

    // POST /api/sop/manage/llmflowchart
    const { mutate: requestLLM } = useCustomMutation<
        { groupNm: string; resultMessage: string },
        string
    >({
        method: "post",
        url: SOP_MANAGE_API.LLM_FLOWCHART.URL,
        mutationKey: SOP_MANAGE_API.LLM_FLOWCHART.POST.KEY,
        headers: { "Content-Type": "application/json" },
        onSuccess: ({ groupNm }) => {
            compnsRef.current = [];
            setGroupNm(groupNm);
        },
        onError: () => {
            onErrorToast("AI 생성 요청에 실패했습니다");
            setLlmStatus(null);
        },
    });

    // SignalR: LLMStatus + LLMCompn 수신
    useLLMSignalR({
        groupName: groupNm,
        onStatus: (action) => {
            setLlmStatus(action);
            if (action === "end") {
                dispatch(setIsLlmGenerating(false));
                onShowToast("SOP 자동 생성이 완료되었습니다");
            }
        },
        onCompn: (data) => {
            const compn = toLLMCompn(data);
            compnsRef.current = [...compnsRef.current, compn];
            setPreviewCompns((prev) => [...prev, compn]);
            // 캔버스 실시간 반영
            dispatch(setNodes(compnsRef.current.map(toNode)));
            dispatch(setEdges(toEdges(compnsRef.current)));
        },
    });

    const handleGenerate = (queryText: string) => {
        if (!queryText.trim() || isGenerating) return;
        dispatch(takeSnapshot()); // 생성 전 스냅샷 (undo 기준점)
        dispatch(setIsLlmGenerating(true));
        setSubmittedQuery(queryText);
        setPreviewCompns([]);
        compnsRef.current = [];
        setGroupNm(null);
        setLlmStatus("searching");
        requestLLM(JSON.stringify(queryText));
    };

    const handleSubmit = () => {
        handleGenerate(query);
        setQuery("");
    };

    const handleStop = () => {
        onUndo();
        dispatch(setIsLlmGenerating(false));
        setGroupNm(null);
        setLlmStatus(null);
        setPreviewCompns([]);
        compnsRef.current = [];
    };

    // 외부(뱃지 정지 버튼)에서 정지 신호가 오면 handleStop 실행
    const llmStopSignalRef = useRef(llmStopSignal);
    useEffect(() => {
        if (llmStopSignal !== llmStopSignalRef.current) {
            llmStopSignalRef.current = llmStopSignal;
            if (isGenerating) handleStop();
        }
    }, [llmStopSignal]);

    // 모달 닫기: UI만 숨김, 생성 결과는 보존
    const handleClose = () => {
        setIsOpen(false);
    };

    // AI 생성 이력이 있거나 시작 노드만 있으면 바로 생성 모달, 아니면 확인 모달
    const handleOpenClick = () => {
        const hasPreviousGeneration = submittedQuery !== "";
        const hasNonStartNode = nodes.some((n) => n.data?.type !== "start");
        if (!hasPreviousGeneration && hasNonStartNode) {
            setIsConfirmOpen(true);
        } else {
            setIsOpen(true);
        }
    };

    return (
        <>
            <ToolbarButton
                icon={<IconSparkle size={20} />}
                text="AI 생성"
                onClick={handleOpenClick}
            />

            {/* 기존 컴포넌트가 있을 때 덮어쓰기 확인 모달 */}
            <ModalBasic
                isActive={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                size="sm"
                padding={32}
                column
                isBottom={false}
            >
                <Box gap={8} column>
                    <Title size="xs" color="G_900">AI SOP 자동 생성</Title>
                    <p style={{ fontSize: 14, color: "var(--G_500)", lineHeight: "172%", margin: 0 }}>
                        캔버스에 이미 컴포넌트가 있습니다.<br />어떻게 진행하시겠습니까?
                    </p>
                </Box>
                <Box align="side" style={{ marginTop: 28 }}>
                    <Box fill />
                    <Box gap={40}>
                        <Button
                            className="textButton"
                            variant="ghost"
                            color="grayscale"
                            size="xs"
                            type="button"
                            onClick={(e) => {
                                setIsConfirmOpen(false);
                                e.stopPropagation();
                            }}
                        >
                            취소
                        </Button>
                        <Button
                            className="textButton"
                            variant="ghost"
                            color="primary"
                            size="xs"
                            type="button"
                            onClick={(e) => {
                                setIsConfirmOpen(false);
                                e.stopPropagation();
                            }}
                        >
                            이어서 진행
                        </Button>
                        <Button
                            className="textButton"
                            variant="ghost"
                            color="primary"
                            size="xs"
                            type="button"
                            onClick={(e) => {
                                setIsConfirmOpen(false);
                                setIsOpen(true);
                                e.stopPropagation();
                            }}
                        >
                            덮어쓰기
                        </Button>
                    </Box>
                </Box>
            </ModalBasic>

            <ModalBasic
                isActive={isOpen}
                onClose={handleClose}
                size="md"
                padding={32}
                column
                isBottom={false}
            >
                {/* 헤더 */}
                <div style={S.header}>
                    <div style={S.headerLeft}>
                        <Title size="xs">AI SOP 생성</Title>
                    </div>
                    <IconButton
                        variant="ghost"
                        color="grayscale"
                        size="sm"
                        icon={<IconX size={16} />}
                        onClick={handleClose}
                    />
                </div>

                {/* 제출된 쿼리 버블 */}
                {submittedQuery && (
                    <div style={S.queryBubble}>
                        <span style={S.queryText}>{submittedQuery}</span>
                    </div>
                )}

                {/* 아이템 없는 생성 중 상태 (searching / reranking) */}
                {isGenerating && previewCompns.length === 0 && (
                    <div style={S.statusText}>
                        <AnimatedStatusText label={STATUS_LABELS[llmStatus]} />
                    </div>
                )}

                {/* 단계 목록 카드 - 생성 중 실시간 표출 */}
                {previewCompns.length > 0 && (
                    <div style={S.previewCard}>
                        <div style={S.previewHeader}>
                            <span>✦</span>
                            <span>
                                {isGenerating
                                    ? <AnimatedStatusText label={STATUS_LABELS[llmStatus]} />
                                    : `생성 완료 • ${previewCompns.length}단계`}
                            </span>
                        </div>
                        <ol style={S.stepList}>
                            {previewCompns.map((c, i) => (
                                <li key={c.compnSn} style={S.stepItem}>
                                    <span style={S.stepNum}>{i + 1}</span>
                                    <span>{c.compnSj}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                )}

                {/* 입력 영역 */}
                <div style={S.inputRow}>
                    <div style={{ flex: 1 }}>
                        <Textarea
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="상황을 설명하세요..."
                            minHeight={72}
                            resize="none"
                        />
                    </div>
                    {isGenerating ? (
                        <IconButton
                            variant="fill"
                            color="grayscale"
                            size="md"
                            icon={<IconStopCircle size={20} />}
                            onClick={handleStop}
                        />
                    ) : (
                        <IconButton
                            variant="fill"
                            color="primary"
                            size="md"
                            icon={<IconArrowUp size={20} />}
                            disabled={!query.trim()}
                            onClick={handleSubmit}
                        />
                    )}
                </div>
            </ModalBasic>
        </>
    );
}

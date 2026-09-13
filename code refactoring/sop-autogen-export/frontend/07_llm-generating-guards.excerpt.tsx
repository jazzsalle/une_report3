// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] AI 생성 중 수동 편집 차단 (가드 코드 모음)
//  isLlmGenerating === true 인 동안 사용자의 수동 조작을 모두 막는다.
// ═════════════════════════════════════════════════════════════════════════════

// ── 1) ReactFlow 캔버스 자체를 읽기 전용으로 ─────────────────────────────
//    protecto-frontend/src/Components/Pages/sop-edit/main/ReactFlow/components/ReactFlowSOPEdit/index.tsx
        const isLlmGenerating = useSelector((state: any) => state.sopreactflow.isLlmGenerating);
                deleteKeyCode={null}
                connectionRadius={50}
                nodesDraggable={!isLlmGenerating}
                nodesConnectable={!isLlmGenerating}
                elementsSelectable={!isLlmGenerating}
                fitView
                fitViewOptions={{ padding: 0.5, maxZoom: 1 }}

// ── 2) 노드 추가 리모콘 비활성화 ─────────────────────────────────────────
//    protecto-frontend/src/Common/ProtectoUI/ReactFlow/components/RemoconBox/index.tsx
export default function Remocon() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isLlmGenerating = useSelector((state: any) => state.sopreactflow.isLlmGenerating);

    return (
        <Panel style={{ position: "relative" }}>
            <S.RemoconBox>
                {/* 🔹 프로세스 노드 버튼 */}
                <RemoconTooltip tooltipText="프로세스 컴포넌트">
                    <RemoconItem type="process" disabled={isLlmGenerating} />
                </RemoconTooltip>

                {/* 🔹 상황전파(Manual) 노드 버튼 */}
                <RemoconTooltip tooltipText="상황전파 컴포넌트">
                    <RemoconItem type="manual" disabled={isLlmGenerating} />
                </RemoconTooltip>

                {/* 🔹 판단(Decision) 노드 버튼 */}
                <RemoconTooltip tooltipText="판단 컴포넌트">
                    <RemoconItem type="decision" disabled={isLlmGenerating} />
                </RemoconTooltip>

                {/* 🔹 종료(End) 노드 버튼 */}
                <RemoconTooltip tooltipText="종료 컴포넌트">
                    <RemoconItem type="end" disabled={isLlmGenerating} />
                </RemoconTooltip>
            </S.RemoconBox>
        </Panel>

// ── 3) 노드 핸들에서 끌어 만드는 컴포넌트 추가 메뉴 비활성화 ─────────────
//    protecto-frontend/src/Components/Pages/sop-edit/main/ReactFlow/components/NodeBox/HandleBox/HandleNodeBox/index.tsx
        const isLlmGenerating = useSelector((state: any) => state.sopreactflow.isLlmGenerating);
        // 버튼 정보 정의 (map으로 반복 렌더링)
        const nodeButtons: NodeButtonItem[] = [
            { type: "process", text: "프로세스 컴포넌트", disabled: isLlmGenerating },
            { type: "manual", text: "상황전파 컴포넌트", disabled: isLlmGenerating },
            { type: "decision", text: "판단 컴포넌트", disabled: isLlmGenerating },
            { type: "end", text: "종료 컴포넌트", disabled: isLlmGenerating },
        ] as const;


// ── 4) 키보드 단축키(복사/붙여넣기/삭제/undo 등) 전체 차단 ───────────────
//    protecto-frontend/src/Components/Pages/sop-edit/main/ReactFlow/hooks/useSOPEditKeyboard/index.ts
    // ReactFlow Redux 상태
    const { canSave, selectedEdgeIds, selectedNodeIds, clipboard, isLlmGenerating } =
        useCustomSelector((state) => state.sopreactflow);

    const { nodePosition } = useNodesPosition(selectedNodeIds);

    /**
     * 키다운 이벤트 리스너
     * - 입력 가능한 영역에서는 무시 (INPUT, textarea, contentEditable)
     * - 키 조합에 따라 편집/저장/재실행 등 동작 수행
     */
    useEffect(() => {
        const keyDownHandler = (event: KeyboardEvent) => {
            // AI SOP 자동 생성 중에는 모든 단축키 차단
            if (isLlmGenerating) return;

            const target = event.target as HTMLElement;

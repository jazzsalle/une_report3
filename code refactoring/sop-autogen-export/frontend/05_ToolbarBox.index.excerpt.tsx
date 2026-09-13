// ═════════════════════════════════════════════════════════════════════════════
//  [발췌] 툴바에 AI 생성 버튼 배치 + 생성 중 편집 기능 비활성화(가드)
//  원본: protecto-frontend/src/Components/Pages/sop-edit/main/ReactFlow/components/ToolbarBox/index.tsx
// ═════════════════════════════════════════════════════════════════════════════

// ── L36: AI 생성 버튼 import ────────────────────────────────────────────
import AiGenerateButton from "./AiGenerateButton";

// ── L69~77: Redux에서 isLlmGenerating 구독 ──────────────────────────────
        past,
        future,
        selectedEdgeIds,
        selectedNodeIds,
        selectedSop,
        clipboard,
        isSaveAsActive,
        isLlmGenerating,
    } = useCustomSelector((state) => state.sopreactflow);

// ── L125~220: 생성 중에는 저장/실행취소/복사/붙여넣기/삭제 등 모두 비활성 ─
    return (
        <>
            <S.ToolbarBox>
                {/* [저장 버튼] */}
                <ToolbarButton
                    icon={<IconCloudDownload className="w-[32rem]! h-[32rem]!" />}
                    text="저장"
                    disabled={
                        isLlmGenerating ||
                        !canSave ||
                        !checkAction(SOP_MANAGE_API.FLOW_CHART.PUT.AUTH)
                    }
                    onClick={onSave}
                />

                {/* [다른 이름으로 저장 버튼] */}
                <ToolbarButton
                    icon={<IconCloudDownload className="w-[32rem]! h-[32rem]!" />}
                    text="다른 이름으로 저장"
                    onClick={() => dispatch(setIsSaveAsActive(true))}
                    disabled={isLlmGenerating || !checkAction(SOP_MANAGE_API.SAVE_AS.POST.AUTH)}
                />

                {/* [내보내기 버튼] */}
                <ExportButton onSaveAsync={onSaveAsync} />

                {/* [가져오기 버튼] — JSON 파일로 현재 플로우차트 교체 */}
                <ImportButton />

                {/* [툴바 구분선] */}
                <S.ToolbarDivision />

                {/* [레이블 버튼] */}
                <LabelButton sopLabelList={label} onSaveLabel={onSaveLabel} />

                {/* [툴바 구분선] */}
                <S.ToolbarDivision />

                {/* [확대/축소 버튼] */}
                <ZoomButton />

                {/* [툴바 구분선] */}
                <S.ToolbarDivision />

                {/* [실행 취소 버튼] */}
                <ToolbarButton
                    icon={<IconUndo className="w-[32rem]! h-[32rem]!" />}
                    text="실행취소"
                    disabled={isLlmGenerating || !past?.length}
                    onClick={onUndo}
                />

                {/* [재실행 버튼] */}
                <ToolbarButton
                    icon={<IconRedo className="w-[32rem]! h-[32rem]!" />}
                    text="재실행"
                    disabled={isLlmGenerating || !future?.length}
                    onClick={onRedo}
                />

                {/* [툴바 구분선] */}
                <S.ToolbarDivision />

                {/* [복사 버튼] */}
                <ToolbarButton
                    icon={<IconCopy className="w-[32rem]! h-[32rem]!" />}
                    text="복사"
                    disabled={isLlmGenerating || canCopyCut()}
                    onClick={() => onCopy()}
                />

                {/* [잘라내기 버튼] */}
                <ToolbarButton
                    icon={<IconCut className="w-[32rem]! h-[32rem]!" />}
                    text="잘라내기"
                    disabled={isLlmGenerating || canCopyCut()}
                    onClick={() => onCut()}
                />

                {/* [붙여넣기] 버튼 */}
                <ToolbarButton
                    icon={<IconPaste className="w-[32rem]! h-[32rem]!" />}
                    text="붙여넣기"
                    disabled={isLlmGenerating || canPaste()}
                    onClick={() => onPaste()}
                />

                {/* [삭제 버튼] */}
                <ToolbarButton
                    icon={<IconBinFill className="w-[32rem]! h-[32rem]!" />}
                    text="삭제"
                    disabled={isLlmGenerating || canDelete()}
                    onClick={() => onDelete()}
                />

                {/* [툴바 구분선] */}

// ── L268~275: AI 생성 버튼 렌더 위치 ────────────────────────────────────
                    disabled={true}
                />

                {/* [AI 생성 버튼] */}
                <AiGenerateButton />
            </S.ToolbarBox>

            {/* [다른 이름으로 저장 모달] */}

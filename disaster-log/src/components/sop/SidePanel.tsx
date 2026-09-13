"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  SOP 편집 우측 속성 패널 — 접기/펼치기 + 좌측 가장자리 드래그로 폭 조절
//  · 폭은 localStorage 에 기억 (sop-panel-width)
//  · 숨겼을 때는 캔버스 우상단에 「패널 열기」 버튼만 남긴다
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton, Tooltip } from "@une-front/react-ui";
import { IconPanelHide, IconPanelShow, IconResize } from "@/components/icons";
import { cn } from "@/lib/utils";

const MIN = 280;
const MAX = 720;
const DEFAULT = 360;
const KEY = "sop-panel-width";
const KEY_HIDDEN = "sop-panel-hidden";

function readNumber(key: string, fallback: number) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v >= MIN && v <= MAX ? v : fallback;
  } catch {
    return fallback;
  }
}

export function useSidePanel() {
  const [width, setWidth] = useState(DEFAULT);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    // 마운트 후 저장값 복원 (SSR 불일치 방지)
    const t = setTimeout(() => {
      setWidth(readNumber(KEY, DEFAULT));
      try {
        setHidden(localStorage.getItem(KEY_HIDDEN) === "1");
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const set = useCallback((w: number) => {
    const clamped = Math.round(Math.min(MAX, Math.max(MIN, w)));
    setWidth(clamped);
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {}
  }, []);
  const toggle = useCallback((v?: boolean) => {
    setHidden((h) => {
      const next = v ?? !h;
      try {
        localStorage.setItem(KEY_HIDDEN, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);
  return { width, setWidth: set, hidden, toggle };
}

export function SidePanel({ width, onWidth, hidden, onToggle, header, children, className }: { width: number; onWidth: (w: number) => void; hidden: boolean; onToggle: () => void; header?: ReactNode; children: ReactNode; className?: string }) {
  const dragging = useRef<{ startX: number; startW: number } | null>(null);
  const [live, setLive] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = { startX: e.clientX, startW: width };
    setLive(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    // 패널은 우측에 있으므로 왼쪽으로 끌면 넓어진다
    onWidth(dragging.current.startW + (dragging.current.startX - e.clientX));
  };
  const onPointerUp = () => {
    dragging.current = null;
    setLive(false);
  };

  if (hidden) return null;

  return (
    <aside className={cn("no-print relative shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] flex flex-col min-h-0", live && "select-none", className)} style={{ width }}>
      {/* 드래그 핸들 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 폭 조절"
        title="드래그해서 폭 조절 · 더블클릭으로 기본 폭"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => onWidth(DEFAULT)}
        className={cn("absolute left-[-4px] top-0 bottom-0 w-[8px] cursor-col-resize z-[5] group", live && "bg-[var(--color-surface-brand-subtle)]")}
      >
        <div className={cn("absolute left-[3px] top-0 bottom-0 w-[2px] transition-colors", live ? "bg-[var(--color-border-brand)]" : "bg-transparent group-hover:bg-[var(--color-border-brand)]")} />
        <div className="absolute left-[-6px] top-1/2 -translate-y-1/2 size-[20rem] rounded-max bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] grid place-items-center text-[var(--color-icon-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity shadow-[var(--elevation-01)]">
          <IconResize size={12} />
        </div>
      </div>

      <div className="flex items-center gap-[6rem] h-[40rem] px-[8rem] border-b border-[var(--color-border-subtle)] shrink-0">
        <div className="flex-1 min-w-0 flex items-center">{header}</div>
        <span className="typo-body-sm text-[var(--color-text-helper)] font-mono">{width}px</span>
        <Tooltip content="속성 패널 숨기기" direction="bottom">
          <IconButton icon={<IconPanelHide size={16} />} variant="ghost" color="grayscale" size="2xs" aria-label="속성 패널 숨기기" onClick={onToggle} />
        </Tooltip>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </aside>
  );
}

/** 패널이 숨겨졌을 때 캔버스 위에 띄우는 「패널 열기」 버튼 */
export function SidePanelOpener({ hidden, onToggle, label = "속성 패널" }: { hidden: boolean; onToggle: () => void; label?: string }) {
  if (!hidden) return null;
  return (
    <button onClick={onToggle} className="absolute right-[16rem] bottom-[16rem] z-[5] inline-flex items-center gap-[6rem] h-[32rem] pl-[10rem] pr-[12rem] rounded-lg bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] shadow-[var(--elevation-03)] typo-body-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]">
      <IconPanelShow size={16} /> {label} 열기
    </button>
  );
}

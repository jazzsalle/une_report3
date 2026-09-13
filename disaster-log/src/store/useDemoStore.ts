"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  시연모드 상태 — 헤더 「시연모드」 버튼으로 켜고, 화면을 가리지 않는 플로팅 패널로 단계 제어
//  sessionStorage 에 보존해 새로고침 후에도 같은 단계에서 이어간다.
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type DemoDock = "right" | "left";

interface DemoState {
  active: boolean;
  scenarioId: string;
  step: number; // 현재 완료(표시)된 단계 index. -1 = 시작 전
  situationId?: string;
  collapsed: boolean;
  dock: DemoDock;
  auto: boolean;
  showList: boolean;
  running: boolean; // 단계 실행 중(중복 클릭 방지)

  start(scenarioId: string): void;
  stop(): void;
  setStep(i: number): void;
  setSituation(id?: string): void;
  setCollapsed(v: boolean): void;
  setDock(d: DemoDock): void;
  setAuto(v: boolean): void;
  setShowList(v: boolean): void;
  setRunning(v: boolean): void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      active: false,
      scenarioId: "wildfire",
      step: -1,
      situationId: undefined,
      collapsed: false,
      dock: "right",
      auto: false,
      showList: false,
      running: false,
      start: (scenarioId) => set({ active: true, scenarioId, step: -1, situationId: undefined, collapsed: false, auto: false, running: false }),
      stop: () => set({ active: false, step: -1, situationId: undefined, auto: false, running: false }),
      setStep: (i) => set({ step: i }),
      setSituation: (id) => set({ situationId: id }),
      setCollapsed: (v) => set({ collapsed: v }),
      setDock: (d) => set({ dock: d }),
      setAuto: (v) => set({ auto: v }),
      setShowList: (v) => set({ showList: v }),
      setRunning: (v) => set({ running: v }),
    }),
    {
      name: "disaster-log-demo-v1",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ active: s.active, scenarioId: s.scenarioId, step: s.step, situationId: s.situationId, collapsed: s.collapsed, dock: s.dock, showList: s.showList }),
    },
  ),
);

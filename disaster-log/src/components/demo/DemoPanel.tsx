"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  시연모드 패널 — 모달이 아닌 플로팅 도킹 패널(우하단/좌하단), 접으면 작은 필(pill)로 축소
//  · 다음/이전으로 화면 이동 + 데이터 조작 · 단계 목록 점프 · 자동 진행 · Alt+←/→ 단축키
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconButton, Tooltip, Switch, Badge as DsBadge } from "@une-front/react-ui";
import { useDemoStore } from "@/store/useDemoStore";
import { useAppStore } from "@/store/useAppStore";
import { SCENARIOS, type DemoCtx } from "@/lib/demo/scenario";
import { Button, useToast } from "@/components/ui";
import { IconArrowLeft, IconArrowRight, IconClose, IconChevronDown, IconChevronUp, IconList, IconRocket, IconCheckCircle, IconClick, IconPin } from "@/components/icons";
import { cn } from "@/lib/utils";

const AUTO_MS = 12000;

export function DemoPanel() {
  const router = useRouter();
  const toast = useToast();
  const d = useDemoStore();
  const deleteSituation = useAppStore((s) => s.deleteSituation);
  const scenario = SCENARIOS[d.scenarioId] ?? SCENARIOS.wildfire;
  const steps = scenario.steps;
  const idx = d.step;
  const cur = idx >= 0 ? steps[idx] : undefined;
  const total = steps.length;
  const progress = Math.max(0, Math.min(100, ((idx + 1) / total) * 100));
  const busyRef = useRef(false);

  const goto = useCallback(
    async (target: number, runIt: boolean) => {
      if (busyRef.current) return;
      const step = steps[target];
      if (!step) return;
      busyRef.current = true;
      useDemoStore.getState().setRunning(true);
      try {
        const c: DemoCtx = { situationId: useDemoStore.getState().situationId, setSituation: (id) => useDemoStore.getState().setSituation(id) };
        if (runIt && step.run) await step.run(c);
        const c2: DemoCtx = { ...c, situationId: useDemoStore.getState().situationId };
        // 상황이 필요한 단계인데 없으면(새로고침 등) 상황 등록 단계로 되돌림
        if (step.href(c2).includes("undefined")) {
          const createIdx = steps.findIndex((s) => s.id === "create");
          useDemoStore.getState().setStep(createIdx);
          const cs = steps[createIdx];
          await cs.run?.(c2);
          router.push(cs.href({ ...c2, situationId: useDemoStore.getState().situationId }));
          return;
        }
        router.push(step.href(c2));
        useDemoStore.getState().setStep(target);
        if (runIt && step.after) await step.after(c2);
      } catch (e) {
        toast.error(`시연 단계 실행 오류: ${(e as Error).message}`);
      } finally {
        busyRef.current = false;
        useDemoStore.getState().setRunning(false);
      }
    },
    [router, steps, toast],
  );

  const next = useCallback(() => { if (idx + 1 < total) void goto(idx + 1, true); }, [goto, idx, total]);
  const prev = useCallback(() => { if (idx > 0) void goto(idx - 1, false); }, [goto, idx]);

  // 첫 진입: 0단계 자동 실행
  useEffect(() => {
    if (d.active && d.step < 0) {
      const t = setTimeout(() => void goto(0, true), 50);
      return () => clearTimeout(t);
    }
  }, [d.active, d.step, goto]);

  // 자동 진행
  useEffect(() => {
    if (!d.active || !d.auto) return;
    if (idx + 1 >= total) {
      useDemoStore.getState().setAuto(false);
      return;
    }
    const t = setTimeout(next, AUTO_MS);
    return () => clearTimeout(t);
  }, [d.active, d.auto, idx, total, next]);

  // 단축키 Alt+→ / Alt+←
  useEffect(() => {
    if (!d.active) return;
    const h = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [d.active, next, prev]);

  if (!d.active) return null;

  const stop = (removeData: boolean) => {
    const sid = useDemoStore.getState().situationId;
    useDemoStore.getState().stop();
    if (removeData && sid) {
      deleteSituation(sid);
      router.push("/");
      toast.info("시연을 종료하고 시연 상황을 삭제했습니다");
    } else toast.info("시연을 종료했습니다");
  };

  const dockCls = d.dock === "right" ? "right-[16px]" : "left-[16px]";

  // 접힘: 작은 필
  if (d.collapsed) {
    return (
      <div className={cn("fixed bottom-[16px] z-[10000] no-print", dockCls)}>
        <div className="flex items-center gap-[6rem] h-[40rem] pl-[12rem] pr-[6rem] rounded-max bg-[var(--color-surface-inverse,#1f2937)] text-white shadow-[var(--elevation-04)]">
          <IconRocket size={16} className="text-[var(--yellow-300,#fcd34d)]" />
          <span className="typo-body-sm font-medium whitespace-nowrap">시연 {idx + 1}/{total} · {cur?.title ?? ""}</span>
          <button onClick={prev} disabled={idx <= 0 || d.running} className="size-[28rem] grid place-items-center rounded-max hover:bg-white/15 disabled:opacity-40" aria-label="이전"><IconArrowLeft size={14} /></button>
          <button onClick={next} disabled={idx + 1 >= total || d.running} className="h-[28rem] px-[10rem] inline-flex items-center gap-[4rem] rounded-max bg-[var(--color-surface-brand)] hover:brightness-110 disabled:opacity-40 typo-body-sm font-medium" aria-label="다음">다음 <IconArrowRight size={14} /></button>
          <button onClick={() => d.setCollapsed(false)} className="size-[28rem] grid place-items-center rounded-max hover:bg-white/15" aria-label="펼치기"><IconChevronUp size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("fixed bottom-[16px] z-[10000] no-print w-[min(400px,calc(100vw-32px))]", dockCls)}>
      <div className="rounded-2xl bg-[var(--color-surface-primary)] border border-[var(--color-border-default)] shadow-[var(--elevation-05,0_12px_40px_rgba(0,0,0,.18))] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center gap-[8rem] px-[12rem] h-[44rem] bg-[var(--color-surface-inverse,#1f2937)] text-white">
          <IconRocket size={18} className="text-[var(--yellow-300,#fcd34d)]" />
          <div className="flex-1 min-w-0">
            <div className="typo-body-sm font-medium truncate">시연모드 · {scenario.name}</div>
          </div>
          <span className="typo-body-sm font-mono opacity-80">{idx + 1}/{total}</span>
          <Tooltip content={d.dock === "right" ? "왼쪽으로 붙이기" : "오른쪽으로 붙이기"} direction="top">
            <button onClick={() => d.setDock(d.dock === "right" ? "left" : "right")} className="size-[28rem] grid place-items-center rounded-md hover:bg-white/15" aria-label="도킹 위치"><IconPin size={14} /></button>
          </Tooltip>
          <button onClick={() => d.setCollapsed(true)} className="size-[28rem] grid place-items-center rounded-md hover:bg-white/15" aria-label="접기"><IconChevronDown size={14} /></button>
          <button onClick={() => stop(false)} className="size-[28rem] grid place-items-center rounded-md hover:bg-white/15" aria-label="시연 종료"><IconClose size={14} /></button>
        </div>
        {/* 진행바 */}
        <div className="h-[3px] bg-[var(--color-surface-muted)]"><div className="h-full bg-[var(--color-surface-brand)] transition-all" style={{ width: `${progress}%` }} /></div>

        {/* 본문 */}
        <div className="p-[14rem] space-y-[10rem] max-h-[min(52vh,460px)] overflow-y-auto">
          {cur ? (
            <>
              <div>
                <div className="typo-body-sm text-[var(--color-text-brand)] font-medium">{cur.where}</div>
                <div className="typo-body-lg font-bold text-[var(--color-text-primary)] mt-[2rem]">{cur.title}</div>
              </div>
              <p className="typo-body-md leading-relaxed text-[var(--color-text-basic)]">{cur.narration}</p>
              {cur.points && cur.points.length > 0 && (
                <ul className="space-y-[4rem]">
                  {cur.points.map((p, i) => (
                    <li key={i} className="flex gap-[6rem] typo-body-sm text-[var(--color-text-secondary)] leading-relaxed"><IconCheckCircle size={14} className="text-[var(--color-icon-success)] mt-[2px] shrink-0" /><span>{p}</span></li>
                  ))}
                </ul>
              )}
              {cur.tryIt && (
                <div className="rounded-lg bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)] typo-body-sm p-[8rem] flex gap-[6rem] leading-relaxed"><IconClick size={14} className="mt-[2px] shrink-0" /><span><b className="font-medium">직접 해보기</b> · {cur.tryIt}</span></div>
              )}
            </>
          ) : (
            <div className="typo-body-md text-[var(--color-text-tertiary)]">시연을 준비하고 있습니다…</div>
          )}

          {idx + 1 >= total && (
            <div className="rounded-lg border border-dashed border-[var(--color-border-default)] p-[8rem] typo-body-sm text-[var(--color-text-tertiary)] flex items-center gap-[8rem]">
              <span className="flex-1">시연에서 만든 상황 「{useAppStore.getState().situations[d.situationId ?? ""]?.title ?? "-"}」</span>
              <Button size="xs" variant="ghost" onClick={() => stop(true)}>삭제 후 종료</Button>
            </div>
          )}
          {d.showList && (
            <div className="border-t border-[var(--color-border-subtle)] pt-[8rem]">
              <div className="label mb-[6rem]">단계 목록 (클릭하면 해당 화면으로 이동 · 데이터는 유지)</div>
              <ol className="space-y-[2rem]">
                {steps.map((s, i) => (
                  <li key={s.id}>
                    <button onClick={() => void goto(i, i > idx)} disabled={d.running} className={cn("w-full text-left flex items-center gap-[8rem] px-[8rem] h-[28rem] rounded-md typo-body-sm hover:bg-[var(--color-surface-subtle)]", i === idx && "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)] font-medium", i < idx && "text-[var(--color-text-tertiary)]")}>
                      <span className={cn("size-[18rem] rounded-max grid place-items-center text-[10px] font-bold shrink-0", i < idx ? "bg-[var(--color-surface-success)] text-white" : i === idx ? "bg-[var(--color-surface-brand)] text-white" : "bg-[var(--color-surface-muted)] text-[var(--color-text-tertiary)]")}>{i < idx ? "✓" : i + 1}</span>
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-[6rem] px-[12rem] py-[10rem] border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-subtle)]">
          <Tooltip content="단계 목록" direction="top"><IconButton icon={<IconList size={16} />} variant={d.showList ? "fill" : "ghost"} color="grayscale" size="xs" aria-label="단계 목록" onClick={() => d.setShowList(!d.showList)} /></Tooltip>
          <label className="inline-flex items-center gap-[6rem] typo-body-sm text-[var(--color-text-secondary)] cursor-pointer select-none whitespace-nowrap">
            <Switch value={d.auto} setValue={(v) => d.setAuto(v)} size="sm" aria-label="자동 진행" /> 자동 진행
          </label>
          <div className="ml-auto flex items-center gap-[6rem] whitespace-nowrap">
            <Button size="sm" variant="outline" leftIcon={<IconArrowLeft size={16} />} disabled={idx <= 0 || d.running} onClick={prev}>이전</Button>
            {idx + 1 < total ? (
              <Button size="sm" rightIcon={<IconArrowRight size={16} />} loading={d.running} onClick={next}>다음</Button>
            ) : (
              <Button size="sm" variant="success" leftIcon={<IconCheckCircle size={16} />} onClick={() => stop(false)}>시연 종료</Button>
            )}
          </div>
        </div>
        <div className="px-[12rem] pb-[8rem] typo-body-sm text-[var(--color-text-helper)] flex items-center gap-[6rem] bg-[var(--color-surface-subtle)]">
          <DsBadge label="Alt+→ 다음 · Alt+← 이전" color="grayscale" variant="outline" size="xs" />
          <span className="truncate">패널은 화면을 가리지 않으며 접거나 좌·우로 옮길 수 있습니다</span>
        </div>
      </div>
    </div>
  );
}

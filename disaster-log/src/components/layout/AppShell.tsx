"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  앱 셸 — 디자인시스템 Header + LNB(LnbItem) 레이아웃
// ─────────────────────────────────────────────────────────────────────────────
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Header, LnbItem, IconButton, Badge as DsBadge, Tooltip } from "@une-front/react-ui";
import { useAppStore } from "@/store/useAppStore";
import { useHydrated } from "@/lib/useHydrated";
import { cn } from "@/lib/utils";
import { ToastProvider } from "@/components/ui";
import { IconDashboard, IconNew, IconBook, IconSettings, IconLinkOn, IconLinkOff, LogoSop, IconBell, IconFlow } from "@/components/icons";

const NAV = [
  { href: "/", label: "대시보드", icon: <IconDashboard size={20} /> },
  { href: "/situations/new", label: "새 업무 시작", icon: <IconNew size={20} /> },
  { href: "/sops", label: "SOP 관리", icon: <IconFlow size={20} /> },
  { href: "/manuals", label: "매뉴얼·Seed 조치", icon: <IconBook size={20} /> },
  { href: "/settings", label: "설정·연계상태", icon: <IconSettings size={20} /> },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useHydrated();
  const order = useAppStore((s) => s.order);
  const situations = useAppStore((s) => s.situations);
  const uniStatus = useAppStore((s) => s.uniStatus);
  const setUniStatus = useAppStore((s) => s.setUniStatus);
  const user = useAppStore((s) => s.user);

  // UNI 연계 상태 주기 점검 (5분)
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/uni/health", { cache: "no-store" });
        const j = await r.json();
        if (alive) setUniStatus({ reachable: !!j.reachable, model: j.model, error: j.error, checkedAt: new Date().toISOString() });
      } catch (e) {
        if (alive) setUniStatus({ reachable: false, error: String(e), checkedAt: new Date().toISOString() });
      }
    };
    const t0 = setTimeout(check, 0);
    const t = setInterval(check, 5 * 60_000);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [setUniStatus]);

  const recent = useMemo(() => (hydrated ? order.slice(0, 6).map((id) => situations[id]).filter(Boolean) : []), [hydrated, order, situations]);

  // 현재 화면 이름 (Header serviceName)
  const serviceName = useMemo(() => {
    if (pathname === "/") return "대시보드";
    if (pathname === "/situations/new") return "새 업무 시작";
    if (pathname === "/manuals") return "매뉴얼·Seed 조치";
    if (pathname === "/sops") return "SOP 라이브러리";
    if (pathname?.startsWith("/sops/")) return "SOP 편집";
    if (pathname === "/settings") return "설정·연계상태";
    if (pathname?.startsWith("/situations/")) {
      const id = pathname.split("/")[2];
      return hydrated ? situations[id]?.title ?? "업무" : "업무";
    }
    return "";
  }, [pathname, hydrated, situations]);

  const go = (href: string) => (e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    router.push(href);
  };

  // 디자인시스템 오버레이(Toast/Modal/Select)는 document 에 포털을 붙이므로 클라이언트 마운트 후에만 렌더
  if (!hydrated) return <div className="min-h-screen bg-[var(--color-bg-subtle)]" />;

  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen">
        {/* 상단 헤더 (디자인시스템 Header) */}
        <Header
          className="no-print"
          sticky
          logo={<LogoSop size={32} />}
          systemName="재난상황일지 생성도구"
          serviceName={serviceName}
          actions={
            <>
              <Tooltip content={uniStatus?.reachable ? `UNI RAG 연결 · 모델 ${uniStatus.model}` : "UNI RAG 접속 불가 — 로컬 대체 생성 모드"} direction="bottom">
                <span className="inline-flex items-center gap-[6rem]">
                  <span className={cn("inline-grid place-items-center size-[28rem] rounded-md", uniStatus?.reachable ? "text-[var(--color-icon-success)] bg-[var(--color-surface-success-subtle)]" : "text-[var(--color-icon-light-warning)] bg-[var(--color-surface-light-warning-subtle)]")}>
                    {uniStatus?.reachable ? <IconLinkOn size={16} /> : <IconLinkOff size={16} />}
                  </span>
                  <DsBadge label={uniStatus == null ? "UNI 확인 중" : uniStatus.reachable ? "UNI 연결" : "UNI 대체모드"} color={uniStatus?.reachable ? "success" : "light-warning"} variant="dot-neutral" size="xs" />
                </span>
              </Tooltip>
              <IconButton icon={<IconBell size={20} />} variant="ghost" color="grayscale" size="sm" aria-label="알림" />
              <IconButton icon={<IconSettings size={20} />} variant="ghost" color="grayscale" size="sm" aria-label="설정" onClick={() => router.push("/settings")} />
            </>
          }
          user={{ name: user.name, greeting: `님 (${user.dept})`, onClick: () => router.push("/settings") }}
        />

        <div className="flex flex-1 min-h-0">
          {/* LNB */}
          <aside className="no-print hidden md:flex w-[240px] shrink-0 flex-col bg-[var(--color-surface-primary)] border-r border-[var(--color-border-subtle)] sticky top-[50px] h-[calc(100vh-50px)] overflow-y-auto">
            <nav className="px-[12rem] pt-[16rem] flex flex-col gap-[4rem]">
              {NAV.map((n) => (
                <LnbItem key={n.href} type="parent" size="md" label={n.label} leadingIcon={n.icon} href={n.href} selected={pathname === n.href || (n.href !== "/" && pathname?.startsWith(n.href + "/"))} onClick={go(n.href)} />
              ))}
            </nav>
            <div className="px-[24rem] pt-[20rem] pb-[6rem] typo-body-sm font-medium text-[var(--color-text-tertiary)]">진행 중 업무</div>
            <nav className="px-[12rem] flex flex-col gap-[2rem]">
              {recent.length === 0 && <div className="px-[12rem] py-[8rem] typo-body-sm text-[var(--color-text-helper)]">아직 업무가 없습니다</div>}
              {recent.map((s) => {
                const href = `/situations/${s.id}`;
                return (
                  <LnbItem
                    key={s.id}
                    type="parent"
                    size="sm"
                    label={<span className="truncate block max-w-[150rem]">{s.title}</span>}
                    leadingIcon={<span className={cn("inline-block size-[8rem] rounded-max", s.mode === "actual" ? "bg-[var(--color-surface-error)]" : "bg-[var(--color-surface-success)]")} />}
                    badge={s.running ? "실행" : undefined}
                    href={href}
                    selected={pathname?.startsWith(href)}
                    onClick={go(href)}
                  />
                );
              })}
            </nav>
            <div className="mt-auto p-[16rem] typo-body-sm text-[var(--color-text-helper)] leading-relaxed">
              UNE Protecto · 재난대응·복구 공통 Core
              <br />
              시나리오 v0.9 · 요구정의 v0.5
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 min-w-0 bg-[var(--color-bg-subtle)]">
            <div className="no-print md:hidden flex items-center gap-[8rem] px-[16rem] py-[10rem] bg-[var(--color-surface-primary)] border-b border-[var(--color-border-subtle)] overflow-x-auto">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className={cn("whitespace-nowrap px-[12rem] h-[32rem] inline-flex items-center rounded-lg typo-body-md", pathname === n.href ? "bg-[var(--color-interaction-primary-bg-muted-default)] text-[var(--color-text-brand)] font-medium" : "text-[var(--color-text-secondary)]")}>
                  {n.label}
                </Link>
              ))}
            </div>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}

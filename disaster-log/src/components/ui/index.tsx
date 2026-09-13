"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  UI 어댑터 — 디자인시스템(@une-front/react-ui) 컴포넌트를 앱 관례에 맞게 감싼다.
//  · Button / Badge / Card / Modal / Tabs / Toast / EmptyState / Input / Textarea /
//    Select / Checkbox 는 DS 컴포넌트를 그대로 렌더 (props 만 매핑)
//  · DS 에 없는 개념(위기경보 배지, 확인상태 배지, Stat 타일, 진행 점)은 DS 토큰으로 자체 구성
// ─────────────────────────────────────────────────────────────────────────────
import { type ComponentProps, type ReactNode, useMemo } from "react";
import {
  Button as DsButton,
  IconButton as DsIconButton,
  Badge as DsBadge,
  Card as DsCard,
  Modal as DsModal,
  Tabs as DsTabs,
  TabList as DsTabList,
  TabButton as DsTabButton,
  ToastProvider as DsToastProvider,
  useToast as useDsToast,
  EmptyState as DsEmptyState,
  Input as DsInput,
  Textarea as DsTextarea,
  Select as DsSelect,
  Checkbox as DsCheckbox,
  Spinner,
  Divider,
  Progress,
  Tooltip,
  SegmentedControl,
  type BadgeColor,
  type BadgeProps as DsBadgeProps,
  type InputProps as DsInputProps,
  type TextareaProps as DsTextareaProps,
  type SelectProps as DsSelectProps,
  type SelectOption,
  type ModalSize as DsModalSize,
} from "@une-front/react-ui";
import { cn } from "@/lib/utils";
import type { AlertLevel, Mode, VerifyState } from "@/lib/types";

type DsButtonProps = ComponentProps<typeof DsButton>;
export { DsIconButton as IconButton, Spinner, Divider, Progress, Tooltip, SegmentedControl };
export type { SelectOption };

// ── Button ───────────────────────────────────────────────────────────────────
/** 앱 variant → DS variant/color 매핑. danger / success 는 DS 에 없는 색 → 토큰으로 오버라이드 */
export type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "success" | "white" | "glass";
export type Size = "xs" | "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, DsButtonProps["size"]> = { xs: "2xs", sm: "xs", md: "sm", lg: "md" };

const VARIANT_MAP: Record<Variant, { variant: DsButtonProps["variant"]; color: DsButtonProps["color"]; className?: string }> = {
  primary: { variant: "fill", color: "primary" },
  secondary: { variant: "fill", color: "grayscale" },
  outline: { variant: "outline", color: "grayscale" },
  ghost: { variant: "ghost", color: "grayscale" },
  white: { variant: "fill", color: "grayscale", className: "!bg-[var(--color-surface-primary)] !text-[var(--color-text-brand)] hover:!bg-[var(--color-interaction-primary-bg-subtle-hover)]" },
  glass: { variant: "outline", color: "primary" },
  danger: { variant: "fill", color: "primary", className: "!bg-[var(--color-surface-error)] hover:!bg-[var(--red-600)] active:!bg-[var(--red-700)] !text-white" },
  success: { variant: "fill", color: "primary", className: "!bg-[var(--color-surface-success)] hover:!bg-[var(--green-600)] active:!bg-[var(--green-700)] !text-white" },
};

export interface ButtonProps extends Omit<DsButtonProps, "variant" | "color" | "size"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = "primary", size = "md", loading, disabled, className, children, leftIcon, ...rest }: ButtonProps) {
  const m = VARIANT_MAP[variant];
  return (
    <DsButton
      {...rest}
      variant={m.variant}
      color={m.color}
      size={SIZE_MAP[size]}
      disabled={disabled || loading}
      leftIcon={loading ? <Spinner size="sm" color="currentColor" trackColor="transparent" className="!size-[16rem]" /> : leftIcon}
      className={cn("font-medium", m.className, className)}
    >
      {children}
    </DsButton>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────
export type Tone = "gray" | "blue" | "green" | "amber" | "red" | "purple" | "navy" | "orange";
const TONE_TO_DS: Record<Tone, BadgeColor | null> = { gray: "grayscale", blue: "primary", green: "success", amber: "light-warning", red: "error", orange: "warning", purple: null, navy: null };

/**
 * DS Badge 는 label:string 만 받는다. 문자열이면 DS Badge(solid-pastel) 를 그대로 사용하고,
 * 아이콘 등 ReactNode 이거나 DS 에 없는 색(purple/navy)이면 동일 규격(h20·radius4·body-sm)으로 자체 렌더.
 */
export function Badge({ children, tone = "gray", className, variant = "solid-pastel", size = "xs" }: { children: ReactNode; tone?: Tone; className?: string; variant?: DsBadgeProps["variant"]; size?: DsBadgeProps["size"] }) {
  const dsColor = TONE_TO_DS[tone];
  if (typeof children === "string" && dsColor) {
    return <DsBadge label={children} color={dsColor} variant={variant} size={size} className={cn("whitespace-nowrap", className)} />;
  }
  const custom: Record<Tone, string> = {
    gray: "bg-[var(--color-surface-gray-subtle)] text-[var(--color-text-tertiary)]",
    blue: "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]",
    green: "bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]",
    amber: "bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)]",
    orange: "bg-[var(--color-surface-warning-subtle)] text-[var(--color-text-warning)]",
    red: "bg-[var(--color-surface-error-subtle)] text-[var(--color-text-error)]",
    purple: "bg-[var(--purple-25)] text-[var(--purple-600)]",
    navy: "bg-[var(--light-blue-25)] text-[var(--dark-blue-100)]",
  };
  const h = size === "xs" ? "h-[20rem] px-[6rem] typo-body-sm" : size === "sm" ? "h-[24rem] px-[8rem] typo-body-sm" : "h-[28rem] px-[8rem] typo-body-md";
  return <span className={cn("inline-flex items-center gap-[4rem] rounded-sm whitespace-nowrap font-normal", h, custom[tone], className)}>{children}</span>;
}

/** 위기경보 수준 배지 — DS primitive 팔레트(light-blue / yellow / orange / red) */
export function AlertBadge({ level, className }: { level: AlertLevel; className?: string }) {
  const map: Record<AlertLevel, string> = {
    관심: "bg-[var(--light-blue-25)] text-[var(--light-blue-600)]",
    주의: "bg-[var(--yellow-25)] text-[var(--yellow-600)]",
    경계: "bg-[var(--orange-25)] text-[var(--orange-600)]",
    심각: "bg-[var(--red-25)] text-[var(--red-600)]",
  };
  const dot: Record<AlertLevel, string> = { 관심: "bg-[var(--light-blue-500)]", 주의: "bg-[var(--yellow-400)]", 경계: "bg-[var(--orange-500)]", 심각: "bg-[var(--red-500)]" };
  return (
    <span className={cn("inline-flex items-center gap-[6rem] h-[20rem] px-[8rem] rounded-sm typo-body-sm font-medium whitespace-nowrap", map[level], className)}>
      <span className={cn("size-[6rem] rounded-max", dot[level])} />
      {level}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  return mode === "actual" ? <Badge tone="red" variant="solid">실제재난</Badge> : <Badge tone="green" variant="solid">안전한국훈련</Badge>;
}

export function VerifyBadge({ v }: { v: VerifyState }) {
  if (v === "confirmed") return <DsBadge label="확인" color="success" variant="dot-neutral" size="xs" />;
  if (v === "unverified") return <DsBadge label="확인 필요" color="light-warning" variant="dot-accent" size="xs" />;
  return <DsBadge label="제외" color="grayscale" variant="dot-neutral" size="xs" />;
}

// ── Card ─────────────────────────────────────────────────────────────────────
/**
 * DS Card(outline · non-interactive) + Card.Header + Card.Body 조합.
 * `padded=false` 면 본문 패딩 없이 리스트 등을 직접 채운다.
 */
export function Card({ children, className, bodyClassName, title, subtitle, right, padded = true, divider = false }: { children?: ReactNode; className?: string; bodyClassName?: string; title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; padded?: boolean; divider?: boolean }) {
  return (
    <DsCard cardStyle="elevated" interactive={false} className={cn("!shadow-[var(--elevation-01)] !border-[var(--color-border-subtle)] !rounded-xl", className)}>
      {(title || right) && <DsCard.Header title={title ?? ""} subtitle={subtitle} actions={right} divider={divider} className={cn("!px-[20rem] !pt-[16rem] !pb-[8rem] items-start", divider && "!pb-[12rem]")} />}
      {padded ? <DsCard.Body className={cn("!px-[20rem] !pb-[20rem]", title || right ? "!pt-[4rem]" : "!pt-[20rem]", bodyClassName)}>{children}</DsCard.Body> : <div className={cn("flex-1 min-h-0", bodyClassName)}>{children}</div>}
    </DsCard>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────
/** 비입력 요소(버튼 그룹 등)에 라벨을 붙일 때 사용. 입력 요소는 TextInput / TextArea / SelectBox 의 label prop 사용 */
export function Field({ label, hint, children, className, required }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={cn("block", className)}>
      <div className="typo-body-md text-[var(--field-text-label)] mb-[6rem]">
        {label}
        {required && <span className="text-[var(--color-text-error)] ml-[2rem]">*</span>}
      </div>
      {children}
      {hint && <div className="typo-body-sm text-[var(--color-text-helper)] mt-[6rem]">{hint}</div>}
    </div>
  );
}

export type TextInputProps = DsInputProps;
export function TextInput(props: TextInputProps) {
  return <DsInput size="md" blockEmoji={false} {...props} />;
}

export type TextAreaProps = DsTextareaProps;
export function TextArea(props: TextAreaProps) {
  return <DsTextarea size="md" blockEmoji={false} resize="vertical" {...props} />;
}

export type SelectBoxProps = DsSelectProps;
export function SelectBox(props: SelectBoxProps) {
  return <DsSelect size="md" {...props} />;
}

export function CheckBox({ checked, onChange, label, size = "md", disabled, className }: { checked: boolean; onChange: (v: boolean) => void; label?: string; size?: "lg" | "md" | "sm"; disabled?: boolean; className?: string }) {
  return <DsCheckbox checked={checked} onCheckedChange={onChange} label={label} size={size} disabled={disabled} className={className} />;
}

// ── Empty state ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, desc, action, size = "md" }: { icon?: ReactNode; title: string; desc?: string; action?: ReactNode; size?: "lg" | "md" | "sm" }) {
  return (
    <div className="flex flex-col items-center justify-center py-[40rem] px-[24rem] rounded-xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-subtle)]">
      <DsEmptyState size={size} visualSize="fixed" visual={icon ? <span className="inline-grid place-items-center size-[56rem] rounded-2xl bg-[var(--color-surface-brand-subtle)] text-[var(--color-icon-brand)]">{icon}</span> : undefined} title={title} description={desc} />
      {action && <div className="mt-[20rem]">{action}</div>}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────
const MODAL_WIDTH: Record<"sm" | "md" | "lg" | "xl", number> = { sm: 440, md: 600, lg: 760, xl: 960 };
export function Modal({ open, onClose, title, description, children, size = "md", footer, intent }: { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; size?: "sm" | "md" | "lg" | "xl"; footer?: ReactNode; intent?: "none" | "info" | "success" | "warning" | "error" }) {
  const dsSize: DsModalSize = size === "sm" ? "md" : "lg";
  return (
    <DsModal open={open} onClose={onClose} title={title} description={description} size={dsSize} width={MODAL_WIDTH[size]} footer={footer} intent={intent ?? "none"} headerDivider footerDivider={!!footer} className="max-h-[92vh]">
      <div className="max-h-[68vh] overflow-y-auto pr-[2rem]">{children}</div>
    </DsModal>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
export interface TabItem<T extends string> {
  key: T;
  label: string;
  icon?: ReactNode;
  badge?: { label: string; tone?: Tone };
  disabled?: boolean;
}
export function Tabs<T extends string>({ value, onChange, items, className, size = "md" }: { value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; size?: "lg" | "md" | "sm" }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <DsTabs value={value} setValue={onChange as never} size={size}>
        <DsTabList>
          {items.map((it) => (
            <div key={it.key} className={cn("flex", it.disabled && "opacity-40 pointer-events-none")}>
              <DsTabButton value={it.key} label={it.label} icon={it.icon} badge={it.badge ? { label: it.badge.label, color: TONE_TO_DS[it.badge.tone ?? "blue"] ?? "primary", variant: "solid-pastel" } : undefined} />
            </div>
          ))}
        </DsTabList>
      </DsTabs>
    </div>
  );
}

// ── Toast (DS ToastProvider 위에 앱 관례 success/error/info 헬퍼) ─────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <DsToastProvider position="bottom-right" duration={3000} maxToasts={3}>
      {children}
    </DsToastProvider>
  );
}
export function useToast() {
  const { toast } = useDsToast();
  return useMemo(
    () => ({
      success: (t: string) => toast(t, { intent: "success" }),
      error: (t: string) => toast(t, { intent: "error" }),
      info: (t: string) => toast(t, { intent: "info" }),
      warning: (t: string) => toast(t, { intent: "warning" }),
    }),
    [toast],
  );
}

// ── Misc ─────────────────────────────────────────────────────────────────────
export function Dots() {
  return (
    <span className="dot-blink">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export function Stat({ label, value, sub, tone = "navy", icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "navy" | "green" | "amber" | "red" | "purple" | "blue"; icon?: ReactNode }) {
  const ring = {
    navy: "bg-[var(--light-blue-25)] text-[var(--dark-blue-100)]",
    blue: "bg-[var(--color-surface-brand-subtle)] text-[var(--color-text-brand)]",
    green: "bg-[var(--color-surface-success-subtle)] text-[var(--color-text-success)]",
    amber: "bg-[var(--color-surface-light-warning-subtle)] text-[var(--color-text-light-warning)]",
    red: "bg-[var(--color-surface-error-subtle)] text-[var(--color-text-error)]",
    purple: "bg-[var(--purple-25)] text-[var(--purple-600)]",
  }[tone];
  return (
    <div className="card p-[16rem] flex items-center gap-[14rem]">
      <div className={cn("size-[44rem] rounded-xl grid place-items-center shrink-0", ring)}>{icon}</div>
      <div className="min-w-0">
        <div className="typo-body-sm text-[var(--color-text-tertiary)]">{label}</div>
        <div className="flex items-baseline gap-[8rem]">
          <div className="typo-title-md font-bold text-[var(--color-text-primary)] leading-none">{value}</div>
          {sub && <div className="typo-body-sm text-[var(--color-text-tertiary)] truncate">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="px-[6rem] py-[2rem] rounded-sm border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] typo-body-sm font-mono">{children}</kbd>;
}

/** 섹션 제목 (페이지 상단) */
export function PageHeader({ eyebrow, title, desc, right }: { eyebrow?: ReactNode; title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-[16rem] flex-wrap">
      <div>
        {eyebrow && <div className="typo-body-sm font-medium text-[var(--color-text-brand)]">{eyebrow}</div>}
        <h1 className="typo-title-md font-bold text-[var(--color-text-primary)] mt-[2rem]">{title}</h1>
        {desc && <p className="typo-body-md text-[var(--color-text-tertiary)] mt-[4rem] max-w-[860rem]">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

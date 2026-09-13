"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  아이콘 어댑터 — 디자인시스템(@une-front/react-ui) 아이콘을 우선 사용한다.
//  · DS 아이콘은 size 가 12|16|20|24|28|32|36|40 고정 → 임의 숫자를 가장 가까운 값으로 매핑
//  · DS 에 없는 아이콘(눈송이 등)만 lucide 로 대체
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentType, SVGProps } from "react";
import * as DS from "@une-front/react-ui";
import { Snowflake as LucideSnowflake, Workflow as LucideWorkflow, GitFork as LucideGitFork, Flag as LucideFlag, Hand as LucideHand } from "lucide-react";
import { cn } from "@/lib/utils";

type DsSize = 12 | 16 | 20 | 24 | 28 | 32 | 36 | 40;
const STEPS: DsSize[] = [12, 16, 20, 24, 28, 32, 36, 40];
const nearest = (n: number): DsSize => STEPS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), STEPS[0]);

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number;
  className?: string;
}

type DsIcon = ComponentType<{ size?: DsSize; className?: string; pathFill?: string }>;

function wrap(Icon: DsIcon) {
  const Wrapped = ({ size = 16, className, ...rest }: IconProps) => <Icon size={nearest(size)} className={cn("shrink-0", className)} {...(rest as object)} />;
  Wrapped.displayName = `DS(${(Icon as { displayName?: string }).displayName ?? "Icon"})`;
  return Wrapped;
}

// 내비게이션 · 레이아웃
export const IconDashboard = wrap(DS.IconGridLine);
export const IconNew = wrap(DS.IconPlus);
export const IconShield = wrap(DS.IconSafety);
export const IconBook = wrap(DS.IconDocument);
export const IconSettings = wrap(DS.IconSetting);
export const IconChevronRight = wrap(DS.IconChevronRight);
export const IconChevronLeft = wrap(DS.IconChevronLeft);
export const IconChevronDown = wrap(DS.IconChevronDown);
export const IconChevronUp = wrap(DS.IconChevronUp);
export const IconLinkOn = wrap(DS.IconLink);
export const IconLinkOff = wrap(DS.IconUnlink);
export const IconMenu = wrap(DS.IconMenu);
export const IconHome = wrap(DS.IconHomeLine);
export const IconUser = wrap(DS.IconProfileCircle);
export const IconBell = wrap(DS.IconAlarmLine);

// 액션
export const IconAi = wrap(DS.IconAi);
export const IconPlus = wrap(DS.IconPlus);
export const IconClose = wrap(DS.IconX);
export const IconSearch = wrap(DS.IconSearch);
export const IconRefresh = wrap(DS.IconReset);
export const IconDownload = wrap(DS.IconFileDownload);
export const IconUpload = wrap(DS.IconFileUpload);
export const IconSave = wrap(DS.IconSaveLine);
export const IconTrash = wrap(DS.IconBinLine);
export const IconEdit = wrap(DS.IconEditLine);
export const IconEye = wrap(DS.IconViewPassword);
export const IconPrint = wrap(DS.IconPrint);
export const IconSend = wrap(DS.IconSend);
export const IconAttach = wrap(DS.IconAttachment);
export const IconFilter = wrap(DS.IconFilter);
export const IconCopy = wrap(DS.IconCopy);
export const IconExport = wrap(DS.IconExport);
export const IconArrowRight = wrap(DS.IconArrowRight);
export const IconArrowLeft = wrap(DS.IconArrowLeft);
export const IconArrowUp = wrap(DS.IconArrowUp);
export const IconArrowDown = wrap(DS.IconArrowDown);
export const IconSkip = wrap(DS.IconDoubleChevronRight);
export const IconCheck = wrap(DS.IconCheck);
export const IconCheckCircle = wrap(DS.IconCheckFill);
export const IconInfo = wrap(DS.IconInfoCircleLine);
export const IconWarning = wrap(DS.IconWarningLine);
export const IconWarningFill = wrap(DS.IconWarningFill);
export const IconLoading = wrap(DS.IconLoading);

// 도메인
export const IconPlay = wrap(DS.IconPlayCircle);
export const IconStop = wrap(DS.IconStopCircle);
export const IconPause = wrap(DS.IconPause);
export const IconClock = wrap(DS.IconClock);
export const IconCalendar = wrap(DS.IconCalendar);
export const IconPin = wrap(DS.IconPoiLine);
export const IconMap = wrap(DS.IconMapLine);
export const IconDocument = wrap(DS.IconDocument);
export const IconDocsCheck = wrap(DS.IconDocsCheck);
export const IconList = wrap(DS.IconListLine);
export const IconMemo = wrap(DS.IconMemo);
export const IconMessage = wrap(DS.IconMessage);
export const IconAnnounce = wrap(DS.IconAnnouncement);
export const IconSpeaker = wrap(DS.IconAnnouncement);
export const IconStorage = wrap(DS.IconStorageLine);
export const IconMonitoring = wrap(DS.IconMonitoringLine);
export const IconFlow = wrap(DS.IconPath);
export const IconFire = wrap(DS.IconFireLine);
export const IconFlood = wrap(DS.IconFloodLine);
export const IconWind = wrap(DS.IconWind);
export const IconSun = wrap(DS.IconSunLine);
export const IconEmergency = wrap(DS.IconEmergencyLine);
export const IconEducation = wrap(DS.IconEducation);
export const IconWorker = wrap(DS.IconWorkerLine);
export const IconBuilding = wrap(DS.IconBuildingLine);
export const IconCall = wrap(DS.IconCall);
export const IconRocket = wrap(DS.IconRocket);
export const IconSerious = wrap(DS.IconSeriousLine);
export const IconWalkie = wrap(DS.IconWalkietalkieLine);
export const IconQuestion = wrap(DS.IconQuestionCircleLine);
export const IconQuestionFill = wrap(DS.IconQuestionCircleFill);
export const IconMail = wrap(DS.IconMail);
export const IconPhone = wrap(DS.IconCall);
export const IconPerson = wrap(DS.IconPerson);
export const IconResize = wrap(DS.IconResize);
export const IconPanelHide = wrap(DS.IconDoubleChevronRight);
export const IconPanelShow = wrap(DS.IconDoubleChevronLeft);
export const IconFullScreen = wrap(DS.IconFullScreen);
export const IconFullScreenClose = wrap(DS.IconFullScreenClose);
export const IconMore = wrap(DS.IconMoreVertical);
export const IconClick = wrap(DS.IconClick);
export const IconTag = wrap(DS.IconTag);

/** DS 배포판(0.46.1)에 없는 아이콘 — lucide 대체 (SOP 노드 아이콘은 DS 차기 버전 IconNode* 로 교체 예정) */
type LucideIcon = ComponentType<{ size?: number; className?: string }>;
function lucide(Icon: LucideIcon) {
  const Wrapped = ({ size = 16, className, ...rest }: IconProps) => <Icon size={size} className={cn("shrink-0", className)} {...(rest as object)} />;
  Wrapped.displayName = `Lucide(${(Icon as { displayName?: string }).displayName ?? "Icon"})`;
  return Wrapped;
}
export const IconNodeProcess = lucide(LucideWorkflow);
export const IconNodeDecision = lucide(LucideGitFork);
export const IconNodeStartEnd = lucide(LucideFlag);
export const IconNodeManual = lucide(LucideHand);
export const IconSnow = lucide(LucideSnowflake);

/** 로고 (디자인시스템 Logos) */
export const LogoProtecto = DS.LogoProtecto;
export const LogoSop = DS.LogoSop;
export const LogoDocx = DS.LogoDocx;
export const LogoPdf = DS.LogoPdf;
export const LogoHwpx = DS.LogoHwpx;

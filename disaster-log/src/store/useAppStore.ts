"use client";
// ─────────────────────────────────────────────────────────────────────────────
//  애플리케이션 상태 저장소 (zustand + localStorage persist)
//  · DB 없이 동작 (Vercel 배포 시 서버 상태 불필요). 후일 Postgres 연결 시 이 파일의
//    액션을 API 호출로 교체하면 UI 변경 없이 전환 가능.
//  · 모든 변경은 상황 이벤트 원장(ledger)에 자동 누적 (UFR-007-001)
// ─────────────────────────────────────────────────────────────────────────────
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Contact,
  ContactInput,
  AlertLevel,
  DisasterType,
  EventType,
  Injection,
  LedgerEvent,
  ManualDocument,
  Mode,
  NodeRun,
  RecommendedAction,
  Region,
  ResourceRecord,
  Report,
  SituationLog,
  Situation,
  SmsRecord,
  SopEdge,
  SopNode,
  SopTemplate,
  SopTemplateSource,
  SopVersion,
  SourceKind,
  TrainingPlan,
  VerifyState,
  WeatherAlert,
} from "@/lib/types";
import { nowIso, uid } from "@/lib/utils";
import { actionsToCompns } from "@/lib/sop/adapter";
import { compnsToFlow, nextNodes } from "@/lib/sop/converters";
import { REPORT_TOC } from "@/lib/seed/templates";

export interface NewSituationInput {
  mode: Mode;
  title: string;
  disasterType: DisasterType;
  organization: string;
  baseTime: string;
  regions: Region[];
  currentStatus?: string;
  alertLevel: AlertLevel;
  training?: TrainingPlan;
}

interface AppState {
  user: { name: string; dept: string };
  situations: Record<string, Situation>;
  order: string[];
  uniStatus: { reachable: boolean; model?: string; checkedAt?: string; error?: string } | null;

  /** SOP 라이브러리 */
  templates: Record<string, SopTemplate>;
  templateOrder: string[];
  createTemplate(input: { name: string; description?: string; disasterTypes: DisasterType[]; tags?: string[]; nodes?: SopNode[]; edges?: SopEdge[]; source?: SopTemplateSource; publish?: boolean }): string;
  updateTemplateMeta(id: string, patch: Partial<Pick<SopTemplate, "name" | "description" | "disasterTypes" | "tags" | "stage">>): void;
  updateTemplateDraft(id: string, nodes: SopNode[], edges: SopEdge[]): void;
  publishTemplate(id: string, note?: string): void;
  duplicateTemplate(id: string): string | undefined;
  deleteTemplate(id: string): void;
  importTemplate(t: SopTemplate): void;
  /** 라이브러리 게시본 → 상황에 배포(실행본 스냅샷) */
  deployTemplate(situationId: string, templateId: string, opts?: { start?: boolean }): string | undefined;
  /** 상황에서 편집한 SOP → 라이브러리 초안에 반영 (templateId 없으면 새 템플릿 생성) */
  pushToLibrary(situationId: string, versionId: string, templateId?: string, name?: string): string | undefined;

  setUser(u: { name: string; dept: string }): void;
  setUniStatus(s: AppState["uniStatus"]): void;

  /** 조직·연락처 (설정 > 조직관리) */
  contacts: Contact[];
  addContact(c: ContactInput): string;
  updateContact(id: string, patch: Partial<ContactInput>): void;
  deleteContacts(ids: string[]): void;
  /** 엑셀 일괄 업로드. mode=replace 면 기존 목록을 비우고 교체. 반환: 추가/갱신 수 */
  importContacts(list: ContactInput[], mode: "append" | "replace" | "merge"): { added: number; updated: number };

  createSituation(input: NewSituationInput): string;
  updateSituation(id: string, patch: Partial<Situation>, ledger?: { title: string; body?: string; type?: EventType }): void;
  deleteSituation(id: string): void;
  importSituation(s: Situation): void;

  addLedger(id: string, ev: Omit<LedgerEvent, "id" | "at"> & { at?: string }): string;
  setLedgerVerify(id: string, evId: string, v: VerifyState): void;

  setWeather(id: string, alerts: WeatherAlert[], summary?: string): void;
  addInjection(id: string, inj: Omit<Injection, "id">): void;

  setRecommendedDocs(id: string, docs: ManualDocument[]): void;
  toggleDoc(id: string, docId: string): void;
  setRecommendedActions(id: string, actions: RecommendedAction[]): void;
  toggleAction(id: string, actionId: string): void;
  setSelectedActions(id: string, ids: string[]): void;
  moveAction(id: string, actionId: string, dir: -1 | 1): void;

  buildSopFromSelection(id: string): string | undefined;
  addSopVersion(id: string, v: Omit<SopVersion, "id" | "version" | "createdAt" | "createdBy">, activate?: boolean): string;
  updateSopFlow(id: string, nodes: SopNode[], edges: SopEdge[]): void;
  confirmSop(id: string, note?: string): void;
  setActiveSop(id: string, versionId: string): void;

  startRun(id: string): void;
  stopRun(id: string): void;
  updateRun(id: string, nodeId: string, patch: Partial<NodeRun>, ledger?: { title: string; body?: string; type?: EventType; source?: SourceKind }): void;
  startNode(id: string, nodeId: string): void;
  /** 세부행동 체크/해제 — 체크 시 원장에 조치 수행 기록 */
  toggleDetailCheck(id: string, nodeId: string, index: number, checked: boolean): void;
  completeNode(id: string, nodeId: string, result?: string, branchValue?: string): void;
  skipNode(id: string, nodeId: string): void;

  addSms(id: string, sms: Omit<SmsRecord, "id" | "at" | "result">): void;
  addResource(id: string, r: Omit<ResourceRecord, "id" | "deployedAt">): void;
  returnResource(id: string, resId: string): void;

  updateLog(id: string, patch: Partial<SituationLog>, historyNote?: string): void;
  updateReport(id: string, patch: Partial<Report>, historyNote?: string): void;
}

const emptyLog = (): SituationLog => ({ templateId: "log-actual-std", draft: "", entries: [], history: [] });
const emptyReport = (mode: Mode): Report => {
  const toc = REPORT_TOC.find((t) => t.mode === mode) ?? REPORT_TOC[0];
  return {
    type: mode,
    title: toc.name,
    sections: toc.sections.map((s) => ({ id: uid("sec-"), title: s, body: "", enabled: true })),
    includes: Object.fromEntries(["results", "log", "sms", "resources", "weather", "damage", "photos", "plan", "injections", "missions"].map((k) => [k, ["results", "log", "sms", "resources", "weather", "plan", "injections", "missions"].includes(k)])),
    history: [],
  };
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const patchSit = (id: string, fn: (s: Situation) => Partial<Situation> | void) =>
        set((st) => {
          const s = st.situations[id];
          if (!s) return st;
          const p = fn(s) ?? {};
          return { situations: { ...st.situations, [id]: { ...s, ...p, updatedAt: nowIso() } } };
        });

      const ledgerEv = (partial: Omit<LedgerEvent, "id" | "at"> & { at?: string }): LedgerEvent => ({
        id: uid("ev-"),
        at: partial.at ?? nowIso(),
        ...partial,
        actor: partial.actor ?? get().user.name,
      });

      return {
        user: { name: "재난담당자", dept: "자연재난과" },
        situations: {},
        order: [],
        uniStatus: null,
        templates: {},
        templateOrder: [],

        setUser: (u) => set({ user: u }),
        setUniStatus: (s) => set({ uniStatus: s }),

        contacts: [],
        addContact: (c) => {
          const id = uid("ct-");
          const now = nowIso();
          set((st) => ({ contacts: [...st.contacts, { ...c, id, createdAt: now, updatedAt: now }] }));
          return id;
        },
        updateContact: (id, patch) => set((st) => ({ contacts: st.contacts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c)) })),
        deleteContacts: (ids) => set((st) => ({ contacts: st.contacts.filter((c) => !ids.includes(c.id)) })),
        importContacts: (list, mode) => {
          const now = nowIso();
          const norm = (v: string) => v.replace(/[^0-9]/g, "");
          let added = 0;
          let updated = 0;
          set((st) => {
            const base: Contact[] = mode === "replace" ? [] : [...st.contacts];
            for (const c of list) {
              const key = norm(c.phone);
              const idx = mode === "merge" ? base.findIndex((x) => (key && norm(x.phone) === key) || (x.name === c.name && x.dept === c.dept)) : -1;
              if (idx >= 0) {
                base[idx] = { ...base[idx], ...c, updatedAt: now };
                updated++;
              } else {
                base.push({ ...c, id: uid("ct-"), createdAt: now, updatedAt: now });
                added++;
              }
            }
            return { contacts: base };
          });
          return { added, updated };
        },

        createSituation: (input) => {
          const id = uid("SIT-");
          const now = nowIso();
          const s: Situation = {
            id,
            mode: input.mode,
            title: input.title,
            disasterType: input.disasterType,
            organization: input.organization,
            baseTime: input.baseTime,
            regions: input.regions,
            currentStatus: input.currentStatus,
            alertLevel: input.alertLevel,
            createdAt: now,
            updatedAt: now,
            createdBy: get().user.name,
            status: "active",
            training: input.training,
            injections: [],
            weatherAlerts: [],
            recommendedDocs: [],
            selectedDocIds: [],
            recommendedActions: [],
            selectedActionIds: [],
            sopVersions: [],
            runs: {},
            running: false,
            sms: [],
            resources: [],
            ledger: [],
            log: { ...emptyLog(), templateId: input.mode === "training" ? "log-training-std" : "log-actual-std" },
            report: emptyReport(input.mode),
          };
          s.ledger.push(
            ledgerEv({
              type: "situation",
              title: `${input.mode === "actual" ? "실제재난" : "안전한국훈련"} 업무 시작`,
              body: `${input.organization} · ${input.title} · 위기경보 ${input.alertLevel}`,
              source: "user",
              verify: "confirmed",
              at: now,
            }),
          );
          if (input.training) {
            s.ledger.push(ledgerEv({ type: "injection", title: `훈련계획 설정: ${input.training.name}`, body: input.training.scenario, source: "user", verify: "confirmed", at: now }));
          }
          set((st) => ({ situations: { ...st.situations, [id]: s }, order: [id, ...st.order] }));
          return id;
        },

        updateSituation: (id, patch, ledger) =>
          patchSit(id, (s) => ({
            ...patch,
            ledger: ledger ? [...s.ledger, ledgerEv({ type: ledger.type ?? "user", title: ledger.title, body: ledger.body, source: "user", verify: "confirmed" })] : s.ledger,
          })),

        deleteSituation: (id) =>
          set((st) => {
            const { [id]: _removed, ...rest } = st.situations;
            void _removed;
            return { situations: rest, order: st.order.filter((x) => x !== id) };
          }),

        importSituation: (s) => set((st) => ({ situations: { ...st.situations, [s.id]: s }, order: st.order.includes(s.id) ? st.order : [s.id, ...st.order] })),

        addLedger: (id, ev) => {
          const e = ledgerEv(ev);
          patchSit(id, (s) => ({ ledger: [...s.ledger, e] }));
          return e.id;
        },
        setLedgerVerify: (id, evId, v) => patchSit(id, (s) => ({ ledger: s.ledger.map((e) => (e.id === evId ? { ...e, verify: v } : e)) })),

        setWeather: (id, alerts, summary) =>
          patchSit(id, (s) => {
            const evs: LedgerEvent[] = [];
            if (alerts.length && s.weatherAlerts.length === 0) {
              for (const a of alerts) evs.push(ledgerEv({ type: "weather", title: `${a.type} 발효 (${a.area})`, body: a.content, source: "official", verify: "confirmed", at: a.effectiveAt }));
            }
            if (summary && !s.weatherSummary) evs.push(ledgerEv({ type: "weather", title: "AI 기상요약 수신", body: summary, source: "ai", verify: "unverified" }));
            return {
              weatherAlerts: alerts,
              weatherSummary: summary ? { text: summary, source: "T3Q 기상 MCP(모의)", fetchedAt: nowIso(), verify: "unverified" } : s.weatherSummary,
              ledger: [...s.ledger, ...evs],
            };
          }),

        addInjection: (id, inj) =>
          patchSit(id, (s) => {
            const i: Injection = { id: uid("inj-"), ...inj };
            return { injections: [...s.injections, i], ledger: [...s.ledger, ledgerEv({ type: "injection", title: `상황부여: ${inj.message.slice(0, 40)}${inj.message.length > 40 ? "…" : ""}`, body: inj.target ? `대상: ${inj.target}` : undefined, source: "user", verify: "confirmed", at: inj.at })] };
          }),

        setRecommendedDocs: (id, docs) => patchSit(id, (s) => ({ recommendedDocs: docs, ledger: [...s.ledger, ledgerEv({ type: "document", title: `관련 문서 ${docs.length}건 조회`, source: "ai", verify: "confirmed" })] })),
        toggleDoc: (id, docId) => patchSit(id, (s) => ({ selectedDocIds: s.selectedDocIds.includes(docId) ? s.selectedDocIds.filter((d) => d !== docId) : [...s.selectedDocIds, docId] })),
        setRecommendedActions: (id, actions) =>
          patchSit(id, (s) => ({
            recommendedActions: actions,
            selectedActionIds: [],
            ledger: [...s.ledger, ledgerEv({ type: "document", title: `SOP 추천정보 일괄 수신 (조치 ${actions.length}건)`, body: `선택 문서 ${s.selectedDocIds.length}건 기준`, source: "ai", verify: "confirmed" })],
          })),
        toggleAction: (id, actionId) => patchSit(id, (s) => ({ selectedActionIds: s.selectedActionIds.includes(actionId) ? s.selectedActionIds.filter((a) => a !== actionId) : [...s.selectedActionIds, actionId] })),
        setSelectedActions: (id, ids) => patchSit(id, () => ({ selectedActionIds: ids })),
        moveAction: (id, actionId, dir) =>
          patchSit(id, (s) => {
            const arr = [...s.selectedActionIds];
            const i = arr.indexOf(actionId);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= arr.length) return;
            [arr[i], arr[j]] = [arr[j], arr[i]];
            return { selectedActionIds: arr };
          }),

        buildSopFromSelection: (id) => {
          const s = get().situations[id];
          if (!s) return;
          const actions = s.selectedActionIds.map((aid) => s.recommendedActions.find((a) => a.id === aid)).filter(Boolean) as RecommendedAction[];
          if (actions.length === 0) return;
          const compns = actionsToCompns(actions, s.organization);
          const { nodes, edges } = compnsToFlow(compns, actions);
          // 라이브러리에 초안으로 함께 저장 (상황 종료 후에도 재사용 가능)
          const tid = get().createTemplate({ name: `${s.title} 기본 SOP`, description: `문서·조치 선택으로 자동 구성 (선택 조치 ${actions.length}건)`, disasterTypes: [s.disasterType], tags: [s.organization, actions[0]?.stage ?? ""].filter(Boolean), nodes, edges, source: "actions" });
          const vid = get().addSopVersion(id, { label: "추천 원본(기본 순차 Flow)", kind: "recommended", nodes, edges, note: `선택 조치 ${actions.length}건 → 기본 Process 노드 순차 연결`, templateId: tid }, true);
          return vid;
        },

        addSopVersion: (id, v, activate = true) => {
          const vid = uid("sop-");
          patchSit(id, (s) => {
            const version = s.sopVersions.length + 1;
            const sv: SopVersion = { id: vid, version, createdAt: nowIso(), createdBy: get().user.name, ...v };
            return {
              sopVersions: [...s.sopVersions, sv],
              activeSopVersionId: activate ? vid : s.activeSopVersionId,
              runs: activate ? {} : s.runs,
              running: activate ? false : s.running,
              currentNodeId: activate ? undefined : s.currentNodeId,
              ledger: [...s.ledger, ledgerEv({ type: "sop", title: `SOP v${version} ${v.label} 생성`, body: v.note ?? `노드 ${v.nodes.length}개 · 연결 ${v.edges.length}개`, source: "sop", verify: "confirmed" })],
            };
          });
          return vid;
        },

        updateSopFlow: (id, nodes, edges) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            if (!active) return;
            if (active.kind === "confirmed" && s.running) {
              // 실행 중 확정본은 새 수정본 버전으로 분리 저장 (UFR-004-009)
              const vid = uid("sop-");
              const sv: SopVersion = { id: vid, version: s.sopVersions.length + 1, label: "실행 중 수정본", kind: "edited", createdAt: nowIso(), createdBy: get().user.name, nodes, edges };
              return { sopVersions: [...s.sopVersions, sv], activeSopVersionId: vid };
            }
            return { sopVersions: s.sopVersions.map((v) => (v.id === active.id ? { ...v, nodes, edges, kind: v.kind === "recommended" ? "edited" : v.kind, label: v.kind === "recommended" ? "수정본" : v.label } : v)) };
          }),

        confirmSop: (id, note) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            if (!active) return;
            const vid = uid("sop-");
            const sv: SopVersion = { ...active, id: vid, version: s.sopVersions.length + 1, label: "실행본", kind: "confirmed", createdAt: nowIso(), createdBy: get().user.name, note };
            return {
              sopVersions: [...s.sopVersions, sv],
              activeSopVersionId: vid,
              runs: {},
              ledger: [...s.ledger, ledgerEv({ type: "sop", title: `SOP 실행본 확정 (v${sv.version})`, body: `노드 ${sv.nodes.length}개 · 상황판단 ${sv.nodes.filter((n) => n.data.kind === "decision").length}개${note ? " · " + note : ""}`, source: "user", verify: "confirmed" })],
            };
          }),

        setActiveSop: (id, versionId) => patchSit(id, (s) => (s.activeSopVersionId === versionId ? undefined : { activeSopVersionId: versionId, runs: {}, running: false, currentNodeId: undefined })),

        startRun: (id) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            if (!active) return;
            const start = active.nodes.find((n) => n.data.kind === "start");
            const runs: Record<string, NodeRun> = { ...s.runs };
            const now = nowIso();
            let current = s.currentNodeId;
            if (start) {
              runs[start.id] = { nodeId: start.id, status: "done", startedAt: now, finishedAt: now, assignee: get().user.name };
              const nxt = nextNodes(start.id, active.edges)[0];
              if (nxt && !runs[nxt]) {
                runs[nxt] = { nodeId: nxt, status: "running", startedAt: now, assignee: get().user.name };
                current = nxt;
              }
            }
            return { running: true, runs, currentNodeId: current, ledger: [...s.ledger, ledgerEv({ type: "run", title: `SOP 실행 시작 (v${active.version})`, source: "sop", verify: "confirmed" })] };
          }),

        stopRun: (id) => patchSit(id, (s) => ({ running: false, ledger: [...s.ledger, ledgerEv({ type: "run", title: "SOP 실행 중지", source: "user", verify: "confirmed" })] })),

        updateRun: (id, nodeId, patch, ledger) =>
          patchSit(id, (s) => ({
            runs: { ...s.runs, [nodeId]: { ...(s.runs[nodeId] ?? { nodeId, status: "pending" }), ...patch } },
            ledger: ledger ? [...s.ledger, ledgerEv({ type: ledger.type ?? "run", title: ledger.title, body: ledger.body, source: ledger.source ?? "user", verify: "confirmed", refId: nodeId })] : s.ledger,
          })),

        startNode: (id, nodeId) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            const node = active?.nodes.find((n) => n.id === nodeId);
            return {
              currentNodeId: nodeId,
              runs: { ...s.runs, [nodeId]: { ...(s.runs[nodeId] ?? { nodeId }), status: "running", startedAt: s.runs[nodeId]?.startedAt ?? nowIso(), assignee: s.runs[nodeId]?.assignee ?? get().user.name } },
              ledger: [...s.ledger, ledgerEv({ type: "run", title: `조치 시작: ${node?.data.title ?? nodeId}`, body: node?.data.leadDept ? `담당 ${node.data.leadDept}` : undefined, source: "sop", verify: "confirmed", refId: nodeId })],
            };
          }),

        toggleDetailCheck: (id, nodeId, index, checked) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            const node = active?.nodes.find((n) => n.id === nodeId);
            const detail = node?.data.details?.[index] ?? `세부행동 ${index + 1}`;
            const prev = s.runs[nodeId] ?? { nodeId, status: "pending" as const };
            const checks = { ...(prev.checks ?? {}) };
            if (checked) checks[String(index)] = nowIso();
            else delete checks[String(index)];
            const run: NodeRun = { ...prev, checks, status: prev.status === "pending" && checked ? "running" : prev.status, startedAt: prev.startedAt ?? (checked ? nowIso() : undefined), assignee: prev.assignee ?? get().user.name };
            return {
              runs: { ...s.runs, [nodeId]: run },
              currentNodeId: checked && prev.status === "pending" ? nodeId : s.currentNodeId,
              ledger: checked ? [...s.ledger, ledgerEv({ type: "run", title: `세부행동 수행: ${detail}`, body: node ? `${node.data.title}${node.data.leadDept ? ` · ${node.data.leadDept}` : ""}` : undefined, source: "user", verify: "confirmed", refId: nodeId })] : s.ledger.filter((e) => !(e.refId === nodeId && e.title === `세부행동 수행: ${detail}`)),
            };
          }),

        completeNode: (id, nodeId, result, branchValue) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            if (!active) return;
            const node = active.nodes.find((n) => n.id === nodeId);
            const now = nowIso();
            const runs: Record<string, NodeRun> = { ...s.runs, [nodeId]: { ...(s.runs[nodeId] ?? { nodeId }), status: "done", finishedAt: now, startedAt: s.runs[nodeId]?.startedAt ?? now, result: result ?? s.runs[nodeId]?.result, branchValue: branchValue ?? s.runs[nodeId]?.branchValue, assignee: s.runs[nodeId]?.assignee ?? get().user.name } };
            const evs: LedgerEvent[] = [];
            if (node?.data.kind === "decision") {
              evs.push(ledgerEv({ type: "branch", title: `상황판단: ${node.data.title} → "${branchValue ?? "-"}"`, source: "user", verify: "confirmed", refId: nodeId }));
            } else {
              evs.push(ledgerEv({ type: "run", title: `조치 완료: ${node?.data.title ?? nodeId}`, source: "sop", verify: "confirmed", refId: nodeId }));
              if (result) evs.push(ledgerEv({ type: "result", title: `조치결과: ${node?.data.title ?? nodeId}`, body: result, source: "user", verify: "confirmed", refId: nodeId }));
            }
            // 다음 노드 자동 진행
            const nexts = nextNodes(nodeId, active.edges, branchValue);
            let current = s.currentNodeId;
            for (const nx of nexts) {
              const nn = active.nodes.find((n) => n.id === nx);
              if (!nn) continue;
              if (nn.data.kind === "end") {
                runs[nx] = { nodeId: nx, status: "done", startedAt: now, finishedAt: now };
                evs.push(ledgerEv({ type: "run", title: "SOP 종료 노드 도달", source: "sop", verify: "confirmed" }));
                current = nx;
              } else if (!runs[nx] || runs[nx].status === "pending") {
                runs[nx] = { nodeId: nx, status: "running", startedAt: now, assignee: get().user.name };
                evs.push(ledgerEv({ type: "run", title: `조치 시작: ${nn.data.title}`, body: nn.data.leadDept ? `담당 ${nn.data.leadDept}` : undefined, source: "sop", verify: "confirmed", refId: nx }));
                current = nx;
              }
            }
            const allDone = active.nodes.every((n) => runs[n.id]?.status === "done" || runs[n.id]?.status === "skipped");
            return { runs, currentNodeId: current, running: allDone ? false : s.running, ledger: [...s.ledger, ...evs] };
          }),

        skipNode: (id, nodeId) =>
          patchSit(id, (s) => {
            const active = s.sopVersions.find((v) => v.id === s.activeSopVersionId);
            const node = active?.nodes.find((n) => n.id === nodeId);
            const now = nowIso();
            const runs: Record<string, NodeRun> = { ...s.runs, [nodeId]: { ...(s.runs[nodeId] ?? { nodeId }), status: "skipped", finishedAt: now } };
            const evs = [ledgerEv({ type: "run", title: `조치 생략: ${node?.data.title ?? nodeId}`, source: "user", verify: "confirmed", refId: nodeId })];
            if (active) {
              for (const nx of nextNodes(nodeId, active.edges)) {
                const nn = active.nodes.find((n) => n.id === nx);
                if (nn && nn.data.kind !== "end" && (!runs[nx] || runs[nx].status === "pending")) runs[nx] = { nodeId: nx, status: "running", startedAt: now, assignee: get().user.name };
              }
            }
            return { runs, ledger: [...s.ledger, ...evs] };
          }),

        addSms: (id, sms) =>
          patchSit(id, (s) => {
            // UNE SMS 모듈 모의 발송: 수신자 중 형식 오류가 있으면 실패 처리
            const fail = sms.recipients.some((r) => /실패|오류/.test(r));
            const rec: SmsRecord = { id: uid("sms-"), at: nowIso(), result: fail ? "fail" : "success", ...sms };
            return { sms: [...s.sms, rec], ledger: [...s.ledger, ledgerEv({ type: "sms", title: `SMS ${rec.result === "success" ? "발송" : "발송 실패"} → ${sms.recipients.slice(0, 3).join(", ")}${sms.recipients.length > 3 ? ` 외 ${sms.recipients.length - 3}` : ""}`, body: sms.message, source: "sms", verify: "confirmed", refId: sms.nodeId })] };
          }),

        addResource: (id, r) =>
          patchSit(id, (s) => {
            const rec: ResourceRecord = { id: uid("res-"), deployedAt: nowIso(), ...r };
            return { resources: [...s.resources, rec], ledger: [...s.ledger, ledgerEv({ type: "resource", title: `자원 투입: ${r.name} ${r.qty}${r.unit}`, body: `${r.category} · 출처 ${r.source}`, source: "resource", verify: "confirmed", refId: r.nodeId })] };
          }),
        returnResource: (id, resId) =>
          patchSit(id, (s) => {
            const r = s.resources.find((x) => x.id === resId);
            if (!r) return;
            return { resources: s.resources.map((x) => (x.id === resId ? { ...x, returnedAt: nowIso() } : x)), ledger: [...s.ledger, ledgerEv({ type: "resource", title: `자원 회수: ${r.name}`, source: "resource", verify: "confirmed" })] };
          }),

        // ── SOP 라이브러리 ──────────────────────────────────────────────
        createTemplate: (input) => {
          const id = uid("TPL-");
          const now = nowIso();
          const nodes: SopNode[] = input.nodes ?? [
            { id: "1", type: "sop", position: { x: 170, y: 40 }, data: { kind: "start", title: "시작", autoRun: true, subMissions: [], ui: {} } },
            { id: "2", type: "sop", position: { x: 170, y: 340 }, data: { kind: "end", title: "종료", autoRun: true, subMissions: [], ui: {} } },
          ];
          const edges: SopEdge[] = input.edges ?? (input.nodes ? [] : [{ id: "xy-edge__1bottom-2top", source: "1", target: "2", sourceHandle: "bottom", targetHandle: "top" }]);
          const t: SopTemplate = {
            id,
            name: input.name,
            description: input.description,
            disasterTypes: input.disasterTypes,
            tags: input.tags ?? [],
            status: "draft",
            draft: { nodes, edges },
            history: [],
            usage: [],
            source: input.source ?? "manual",
            createdAt: now,
            updatedAt: now,
            createdBy: get().user.name,
          };
          set((st) => ({ templates: { ...st.templates, [id]: t }, templateOrder: [id, ...st.templateOrder] }));
          if (input.publish) get().publishTemplate(id, "초기 게시");
          return id;
        },
        updateTemplateMeta: (id, patch) => set((st) => (st.templates[id] ? { templates: { ...st.templates, [id]: { ...st.templates[id], ...patch, updatedAt: nowIso() } } } : st)),
        updateTemplateDraft: (id, nodes, edges) => set((st) => (st.templates[id] ? { templates: { ...st.templates, [id]: { ...st.templates[id], draft: { nodes, edges }, updatedAt: nowIso() } } } : st)),
        publishTemplate: (id, note) =>
          set((st) => {
            const t = st.templates[id];
            if (!t) return st;
            const version = (t.published?.version ?? 0) + 1;
            const now = nowIso();
            const published = { version, nodes: t.draft.nodes, edges: t.draft.edges, publishedAt: now, publishedBy: get().user.name, note };
            return { templates: { ...st.templates, [id]: { ...t, status: "published", published, history: [...t.history, { version, publishedAt: now, publishedBy: get().user.name, note, nodeCount: t.draft.nodes.length }], updatedAt: now } } };
          }),
        duplicateTemplate: (id) => {
          const t = get().templates[id];
          if (!t) return;
          return get().createTemplate({ name: `${t.name} (복사)`, description: t.description, disasterTypes: t.disasterTypes, tags: t.tags, nodes: t.draft.nodes, edges: t.draft.edges, source: t.source });
        },
        deleteTemplate: (id) =>
          set((st) => {
            const { [id]: _removed, ...rest } = st.templates;
            void _removed;
            return { templates: rest, templateOrder: st.templateOrder.filter((x) => x !== id) };
          }),
        importTemplate: (t) => set((st) => ({ templates: { ...st.templates, [t.id]: t }, templateOrder: st.templateOrder.includes(t.id) ? st.templateOrder : [t.id, ...st.templateOrder] })),

        deployTemplate: (situationId, templateId, opts) => {
          const t = get().templates[templateId];
          const s = get().situations[situationId];
          if (!t || !s) return;
          const src = t.published ?? { version: 0, nodes: t.draft.nodes, edges: t.draft.edges };
          // 노드/엣지 깊은 복사 — 상황 실행 이력이 라이브러리 원본과 분리되도록 스냅샷
          const nodes = JSON.parse(JSON.stringify(src.nodes)) as SopNode[];
          const edges = JSON.parse(JSON.stringify(src.edges)) as SopEdge[];
          const vid = get().addSopVersion(situationId, { label: `라이브러리 「${t.name}」 v${src.version}`, kind: "confirmed", nodes, edges, note: t.published ? "게시본 배포" : "초안 배포(미게시)", templateId, templateVersion: src.version }, true);
          set((st) => ({ templates: { ...st.templates, [templateId]: { ...t, usage: [...t.usage, { situationId, situationTitle: s.title, deployedAt: nowIso(), version: src.version }] } } }));
          if (opts?.start) get().startRun(situationId);
          return vid;
        },

        pushToLibrary: (situationId, versionId, templateId, name) => {
          const s = get().situations[situationId];
          const v = s?.sopVersions.find((x) => x.id === versionId);
          if (!s || !v) return;
          const nodes = JSON.parse(JSON.stringify(v.nodes)) as SopNode[];
          const edges = JSON.parse(JSON.stringify(v.edges)) as SopEdge[];
          const target = templateId ?? v.templateId;
          if (target && get().templates[target]) {
            get().updateTemplateDraft(target, nodes, edges);
            patchSit(situationId, (st) => ({ ledger: [...st.ledger, ledgerEv({ type: "sop", title: `SOP 라이브러리 「${get().templates[target].name}」 초안에 반영`, body: `상황 SOP v${v.version} → 라이브러리 (게시 전)`, source: "user", verify: "confirmed" })] }));
            return target;
          }
          const tid = get().createTemplate({ name: name ?? `${s.title} SOP`, description: `상황 「${s.title}」에서 저장`, disasterTypes: [s.disasterType], tags: [s.organization], nodes, edges, source: "situation" });
          patchSit(situationId, (st) => ({ sopVersions: st.sopVersions.map((x) => (x.id === versionId ? { ...x, templateId: tid } : x)), ledger: [...st.ledger, ledgerEv({ type: "sop", title: `SOP 라이브러리에 새 템플릿으로 저장`, body: name ?? `${s.title} SOP`, source: "user", verify: "confirmed" })] }));
          return tid;
        },

        updateLog: (id, patch, historyNote) =>
          patchSit(id, (s) => ({
            log: { ...s.log, ...patch, history: historyNote ? [...s.log.history, { at: nowIso(), by: get().user.name, note: historyNote }] : s.log.history },
            ledger: historyNote && /확정/.test(historyNote) ? [...s.ledger, ledgerEv({ type: "log", title: historyNote, source: "user", verify: "confirmed" })] : s.ledger,
          })),
        updateReport: (id, patch, historyNote) =>
          patchSit(id, (s) => ({
            report: { ...s.report, ...patch, history: historyNote ? [...s.report.history, { at: nowIso(), by: get().user.name, note: historyNote }] : s.report.history },
            ledger: historyNote && /확정|생성/.test(historyNote) ? [...s.ledger, ledgerEv({ type: "report", title: historyNote, source: "user", verify: "confirmed" })] : s.ledger,
          })),
      };
    },
    {
      name: "disaster-log-store-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, situations: s.situations, order: s.order, templates: s.templates, templateOrder: s.templateOrder, contacts: s.contacts }),
    },
  ),
);

export const selectSituation = (id: string) => (s: AppState) => s.situations[id];
export const selectActiveSop = (sit?: Situation) => sit?.sopVersions.find((v) => v.id === sit.activeSopVersionId);

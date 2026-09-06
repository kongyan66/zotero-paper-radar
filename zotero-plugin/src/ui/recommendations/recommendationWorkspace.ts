import { config } from "../../../package.json";
import { WorkspaceTab } from "../../infrastructure/zotero/workspaceTab";
import { TaskCenterView } from "../tasks/taskCenter";
import type { OperationTaskRepository } from "../../infrastructure/storage/operationTaskRepository.ts";
import { TaskCenterController } from "../tasks/taskCenterController.ts";
import {
  DiagnosticsView,
  type DiagnosticsViewActions,
} from "../diagnostics/diagnosticsView.ts";
import type { DiagnosticsExport } from "../../infrastructure/diagnostics/runLogger.ts";
import {
  ProfileEditorView,
  type ProfileStructureActions,
  type ProfileEditorRow,
} from "../profiles/profileEditorView.ts";
import {
  RecommendationToolbarView,
  type RecommendationToolbarState,
  type RecommendationProfileOption,
} from "./toolbar.ts";
import {
  RecommendationListView,
  type RecommendationCardModel,
} from "./recommendationList.ts";
import { WorkspaceLayoutController } from "./workspaceLayoutController.ts";
import type { RecommendationHistoryDay } from "../../domain/recommendations/recommendationHistory.ts";

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

export class RecommendationWorkspaceView {
  #root?: HTMLElement;
  #taskCenter?: TaskCenterView | TaskCenterController;
  #recommendationList?: RecommendationListView;
  #recommendationCount?: HTMLElement;
  #recommendationDay?: HTMLElement;
  #toolbar?: RecommendationToolbarView;
  #profileEditor?: ProfileEditorView;
  #profileHost?: HTMLElement;
  #diagnostics?: DiagnosticsView;
  #diagnosticsHost?: HTMLElement;
  #layout?: WorkspaceLayoutController;
  readonly #doc: Document;
  readonly #options: RecommendationWorkspaceViewOptions;

  constructor(doc: Document, options: RecommendationWorkspaceViewOptions = {}) {
    this.#doc = doc;
    this.#options = options;
  }

  mount(parent: Element): void {
    const root = html<HTMLDivElement>(this.#doc, "div");
    root.id = `${config.addonRef}-workspace-tab-root`;
    root.className = "zad-workspace";

    this.#toolbar = new RecommendationToolbarView(this.#doc, {
      profiles: this.#options.profiles,
      categories: this.#options.categories,
      historyDays: this.#options.historyDays,
      initialCount: this.#options.initialCount,
      onRefresh: this.#options.onRefresh,
      onHistoryDayChange: this.#options.onHistoryDayChange,
    });
    this.#toolbar.mount(root);
    const content = html<HTMLDivElement>(this.#doc, "div");
    content.className = "zad-workspace-content";
    this.#profileHost = html<HTMLDivElement>(this.#doc, "div");
    this.#profileHost.className = "zad-profile-host";
    this.#profileEditor = new ProfileEditorView(this.#doc);
    this.setProfileDetails(this.#options.profileDetails ?? []);
    content.appendChild(this.#profileHost);
    content.appendChild(this.createRecommendationArea());
    this.#taskCenter =
      this.#options.taskCenter ?? new TaskCenterView(this.#doc);
    if (this.#taskCenter instanceof TaskCenterController) {
      void this.#taskCenter.mount(content, { initialRefresh: false });
    } else {
      void this.#taskCenter.mount(content);
    }
    const taskCenterRoot =
      content.querySelector<HTMLElement>(".zad-task-center");
    this.#diagnosticsHost = html<HTMLDivElement>(this.#doc, "div");
    this.#diagnosticsHost.className = "zad-diagnostics-host";
    content.appendChild(this.#diagnosticsHost);
    if (taskCenterRoot) {
      this.#layout = new WorkspaceLayoutController(this.#doc);
      this.#layout.mount(content, taskCenterRoot, this.#diagnosticsHost);
    }
    root.appendChild(content);
    parent.appendChild(root);
    this.#root = root;
  }

  setRecommendations(models: readonly RecommendationCardModel[]): void {
    this.#recommendationList?.setRecommendations(models);
    if (this.#recommendationCount) {
      this.#recommendationCount.textContent = `${models.length} 篇`;
    }
  }

  setHistoryDays(
    days: readonly RecommendationHistoryDay[],
    selectedDay?: string,
  ): void {
    this.#toolbar?.setHistoryDays(days, selectedDay);
    this.setRecommendationDay(selectedDay ?? days[0]?.dayKey);
  }

  setRecommendationDay(dayKey?: string): void {
    if (this.#recommendationDay) {
      this.#recommendationDay.textContent = dayKey
        ? `推荐日：${dayKey}`
        : "推荐日：暂无";
    }
  }

  setReady(ready: boolean): void {
    this.#toolbar?.setReady(ready);
  }

  setStatus(message: string, state: "ready" | "working" | "error"): void {
    this.#toolbar?.setStatus(message, state);
  }

  setCacheSummary(count: number, updatedAt?: string): void {
    this.#toolbar?.setCacheSummary(count, updatedAt);
  }

  setProfiles(profiles: readonly RecommendationProfileOption[]): void {
    this.#toolbar?.setProfiles(profiles);
  }

  setProfileDetails(profiles: readonly ProfileEditorRow[]): void {
    if (!this.#profileEditor || !this.#profileHost) return;
    const editable = profiles.map((profile) => ({
      ...profile,
      ...(this.#options.onEditProfile
        ? { onEdit: () => this.#options.onEditProfile!(profile.lineageId) }
        : {}),
      ...(this.#options.onToggleProfileLocked
        ? {
            onToggleLocked: () =>
              this.#options.onToggleProfileLocked!(
                profile.lineageId,
                !profile.locked,
              ),
          }
        : {}),
      ...(this.#options.onToggleProfileDisabled
        ? {
            onToggleDisabled: () =>
              this.#options.onToggleProfileDisabled!(
                profile.lineageId,
                !profile.disabled,
              ),
          }
        : {}),
    }));
    this.#profileEditor.mount(this.#profileHost, editable, {
      includeDisabled: true,
      actions: this.#options.profileStructureActions,
    });
  }

  setDiagnostics(
    summary: DiagnosticsExport,
    actions: DiagnosticsViewActions,
  ): void {
    if (!this.#diagnosticsHost) return;
    this.#diagnostics?.destroy();
    this.#diagnostics = new DiagnosticsView(this.#doc, actions);
    this.#diagnostics.mount(this.#diagnosticsHost, summary);
  }

  async refreshTasks(): Promise<void> {
    if (this.#taskCenter instanceof TaskCenterController) {
      await this.#taskCenter.refreshNow();
    }
  }

  readToolbarState(): RecommendationToolbarState | undefined {
    return this.#toolbar?.readState();
  }

  destroy(): void {
    this.#taskCenter?.destroy();
    this.#taskCenter = undefined;
    this.#layout?.destroy();
    this.#layout = undefined;
    this.#recommendationList?.destroy();
    this.#recommendationList = undefined;
    this.#toolbar?.destroy();
    this.#toolbar = undefined;
    this.#profileEditor?.destroy();
    this.#profileEditor = undefined;
    this.#profileHost = undefined;
    this.#diagnostics?.destroy();
    this.#diagnostics = undefined;
    this.#diagnosticsHost = undefined;
    this.#recommendationCount = undefined;
    this.#recommendationDay = undefined;
    this.#root?.remove();
    this.#root = undefined;
  }

  private createRecommendationArea(): HTMLElement {
    const section = html<HTMLElement>(this.#doc, "section");
    section.className = "zad-recommendations";
    section.setAttribute("aria-labelledby", "zad-recommendations-title");
    const header = html<HTMLElement>(this.#doc, "header");
    header.className = "zad-section-header";
    const title = html<HTMLHeadingElement>(this.#doc, "h2");
    title.id = "zad-recommendations-title";
    title.textContent = "推荐结果";
    const count = html<HTMLSpanElement>(this.#doc, "span");
    count.textContent = "0 篇";
    this.#recommendationCount = count;
    const meta = html<HTMLDivElement>(this.#doc, "div");
    meta.className = "zad-section-meta";
    const day = html<HTMLSpanElement>(this.#doc, "span");
    day.dataset.role = "recommendation-day";
    day.textContent = "推荐日：暂无";
    this.#recommendationDay = day;
    meta.append(day, count);
    header.append(title, meta);
    this.#recommendationList = new RecommendationListView(this.#doc);
    this.#recommendationList.mount(section);
    this.#recommendationList.setRecommendations([]);
    section.appendChild(header);
    section.insertBefore(header, section.firstChild);
    return section;
  }
}

interface RecommendationWorkspaceViewOptions {
  readonly profiles?: readonly RecommendationProfileOption[];
  readonly categories?: readonly string[];
  readonly historyDays?: readonly RecommendationHistoryDay[];
  readonly profileDetails?: readonly ProfileEditorRow[];
  readonly initialCount?: number;
  readonly onRefresh?: (
    state: RecommendationToolbarState,
  ) => void | Promise<void>;
  readonly onHistoryDayChange?: (
    dayKey: string,
    profileIDs: readonly string[],
  ) => void | Promise<void>;
  readonly onEditProfile?: (lineageID: string) => void | Promise<void>;
  readonly onToggleProfileLocked?: (
    lineageID: string,
    locked: boolean,
  ) => void | Promise<void>;
  readonly onToggleProfileDisabled?: (
    lineageID: string,
    disabled: boolean,
  ) => void | Promise<void>;
  readonly profileStructureActions?: ProfileStructureActions;
  readonly taskCenter?: TaskCenterController;
}

interface LegacyMenu {
  readonly element: Element;
  readonly window: Window;
}

export class RecommendationWorkspaceController {
  readonly #tabs = new Map<Window, WorkspaceTab>();
  readonly #views = new Map<Window, RecommendationWorkspaceView>();
  readonly #legacyMenus: LegacyMenu[] = [];
  #menuID?: string;
  readonly #runtime?: RecommendationWorkspaceRuntime;
  readonly #tasks?: OperationTaskRepository;
  readonly #initialCount: number;
  #profiles: readonly RecommendationProfileOption[];
  #profileDetails: readonly ProfileEditorRow[];
  #historyDays: readonly RecommendationHistoryDay[];

  constructor(options: RecommendationWorkspaceControllerOptions = {}) {
    this.#runtime = options.runtime;
    this.#tasks = options.tasks;
    this.#initialCount = options.initialCount ?? 5;
    this.#profiles = options.profiles ?? [];
    this.#profileDetails = options.profileDetails ?? [];
    this.#historyDays = options.historyDays ?? [];
  }

  mountWindow(win: _ZoteroTypes.MainWindow): void {
    if (this.#tabs.has(win)) return;
    const tab = new WorkspaceTab(win, (container) => {
      const taskCenter =
        this.#runtime && this.#tasks
          ? new TaskCenterController(
              win.document,
              this.#tasks,
              this.#runtime.taskActions(),
              {
                onTaskUpdated: (task) => {
                  if (
                    task.taskType === "build-profile" &&
                    task.status === "completed"
                  ) {
                    return this.refreshProfiles();
                  }
                },
              },
            )
          : undefined;
      const view = new RecommendationWorkspaceView(win.document, {
        profiles: this.#profiles,
        categories: this.#runtime?.getArxivCategories?.(),
        historyDays: this.#historyDays,
        profileDetails: this.#profileDetails,
        initialCount: this.#initialCount,
        onRefresh: this.#runtime ? (state) => this.refresh(state) : undefined,
        onHistoryDayChange: this.#runtime?.loadRecommendationsForDay
          ? (dayKey, profileIDs) => this.selectHistoryDay(dayKey, profileIDs)
          : undefined,
        onEditProfile: this.#runtime?.editProfile
          ? (lineageID) => this.editProfile(lineageID)
          : undefined,
        onToggleProfileLocked: this.#runtime?.updateProfileFlags
          ? (lineageID, locked) =>
              this.updateProfileFlags(lineageID, { locked })
          : undefined,
        onToggleProfileDisabled: this.#runtime?.updateProfileFlags
          ? (lineageID, disabled) =>
              this.updateProfileFlags(lineageID, { disabled })
          : undefined,
        profileStructureActions: this.#runtime
          ? {
              onMerge: this.#runtime.mergeProfiles
                ? () => this.mergeProfiles()
                : undefined,
              onSplit: this.#runtime.splitProfile
                ? () => this.splitProfile()
                : undefined,
              onRollback: this.#runtime.rollbackProfileVersion
                ? () => this.rollbackProfileVersion()
                : undefined,
            }
          : undefined,
        taskCenter,
      });
      view.mount(container);
      view.setReady(this.#runtime?.isReady() ?? false);
      this.#views.set(win, view);
      if (this.#runtime) void this.hydrate(view);
      return () => view.destroy();
    });
    tab.mount();
    this.#tabs.set(win, tab);
    if (!Reflect.get(Zotero, "MenuManager")) this.mountLegacyMenu(win);
  }

  unmountWindow(win: Window): void {
    this.#tabs.get(win)?.destroy();
    this.#tabs.delete(win);
    this.#views.delete(win);
    for (const menu of this.#legacyMenus.filter(
      (candidate) => candidate.window === win,
    )) {
      menu.element.remove();
      this.#legacyMenus.splice(this.#legacyMenus.indexOf(menu), 1);
    }
  }

  registerMenu(): void {
    const menuManager = Reflect.get(Zotero, "MenuManager") as
      | typeof Zotero.MenuManager
      | undefined;
    if (!menuManager || this.#menuID) return;
    const registered = menuManager.registerMenu({
      menuID: `${config.addonRef}-tools-menu`,
      pluginID: config.addonID,
      target: "main/menubar/tools",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "zotero-arxiv-daily-menu-open",
          onCommand: () => this.open(),
        },
      ],
    });
    if (registered) this.#menuID = registered;
  }

  open(win = Zotero.getMainWindow()): string | undefined {
    if (!win) return undefined;
    this.mountWindow(win);
    return this.#tabs.get(win)?.open();
  }

  setRecommendations(models: readonly RecommendationCardModel[]): void {
    for (const view of this.#views.values()) view.setRecommendations(models);
  }

  setReady(ready: boolean): void {
    for (const view of this.#views.values()) view.setReady(ready);
  }

  async refreshProfiles(): Promise<void> {
    if (!this.#runtime) return;
    this.#profiles = await this.#runtime.getProfileOptions();
    this.#profileDetails = this.#runtime.getProfileDetails
      ? await this.#runtime.getProfileDetails()
      : [];
    for (const view of this.#views.values()) view.setProfiles(this.#profiles);
    for (const view of this.#views.values())
      view.setProfileDetails(this.#profileDetails);
  }

  destroy(): void {
    const menuManager = Reflect.get(Zotero, "MenuManager") as
      | typeof Zotero.MenuManager
      | undefined;
    if (this.#menuID) menuManager?.unregisterMenu(this.#menuID);
    this.#menuID = undefined;
    for (const tab of this.#tabs.values()) tab.destroy();
    this.#tabs.clear();
    this.#views.clear();
    for (const menu of this.#legacyMenus) menu.element.remove();
    this.#legacyMenus.length = 0;
  }

  private mountLegacyMenu(win: _ZoteroTypes.MainWindow): void {
    const parent = win.document.querySelector("#menu_ToolsPopup");
    if (!parent) return;
    const item = win.document.createXULElement("menuitem");
    item.id = `${config.addonRef}-legacy-tools-menu`;
    item.setAttribute("label", "打开今日推荐");
    item.addEventListener("command", () => this.open(win));
    parent.appendChild(item);
    this.#legacyMenus.push({ element: item, window: win });
  }

  private async refresh(state: RecommendationToolbarState): Promise<void> {
    if (!this.#runtime) return;
    for (const view of this.#views.values()) {
      view.setStatus("正在生成推荐", "working");
    }
    try {
      const models = await this.#runtime.refresh(state);
      this.setRecommendations(models);
      const history = this.#runtime.getRecommendationHistory
        ? await this.#runtime.getRecommendationHistory()
        : [];
      this.#historyDays = history;
      const selectedDay = history[0]?.dayKey;
      for (const view of this.#views.values()) {
        view.setHistoryDays(history, selectedDay);
        view.setStatus("推荐已更新", "ready");
        view.setCacheSummary(models.length, new Date().toISOString());
      }
      await this.refreshProfiles();
    } catch (error) {
      const message = error instanceof Error ? error.message : "推荐任务失败";
      for (const view of this.#views.values()) {
        view.setStatus(message, "error");
      }
    }
  }

  private async hydrate(view: RecommendationWorkspaceView): Promise<void> {
    if (!this.#runtime) return;
    let phase = "缓存推荐";
    try {
      const history = this.#runtime.getRecommendationHistory
        ? await this.#runtime.getRecommendationHistory()
        : [];
      this.#historyDays = history;
      const selectedDay = history[0]?.dayKey;
      // Zotero's DBConnection is serialized by the host. Keep hydration
      // sequential so nested profile reads cannot race each other.
      const models = await this.#runtime.loadCachedModels();
      phase = "近期和长期画像";
      const profiles = await this.#runtime.getProfileOptions();
      phase = "画像详情";
      const details = this.#runtime.getProfileDetails
        ? await this.#runtime.getProfileDetails()
        : [];
      phase = "诊断摘要";
      const diagnostics = this.#runtime.getDiagnosticsSummary
        ? await this.#runtime.getDiagnosticsSummary()
        : undefined;
      this.#profiles = profiles;
      this.#profileDetails = details;
      view.setProfiles(profiles);
      view.setProfileDetails(details);
      view.setRecommendations(models);
      view.setHistoryDays(history, selectedDay);
      view.setCacheSummary(models.length);
      view.setReady(this.#runtime.isReady());
      if (diagnostics) {
        view.setDiagnostics(diagnostics, this.diagnosticsActions(view));
      }
      await view.refreshTasks();
    } catch (error) {
      const message =
        error instanceof Error
          ? `读取${phase}失败：${error.message || error.name}`
          : `读取${phase}失败：${String(error) || "未知错误"}`;
      view.setStatus(message, "error");
    }
  }

  private async selectHistoryDay(
    dayKey: string,
    profileIDs: readonly string[],
  ): Promise<void> {
    if (!this.#runtime?.loadRecommendationsForDay) return;
    try {
      const models = await this.#runtime.loadRecommendationsForDay(
        dayKey,
        profileIDs,
      );
      const history = this.#runtime.getRecommendationHistory
        ? await this.#runtime.getRecommendationHistory()
        : this.#historyDays;
      const selected = history.find((day) => day.dayKey === dayKey);
      this.#historyDays = history;
      for (const view of this.#views.values()) {
        view.setRecommendations(models);
        view.setHistoryDays(history, dayKey);
        view.setStatus(
          selected ? `已载入 ${selected.dayKey} 推荐` : "未找到该日期推荐",
          selected ? "ready" : "error",
        );
        view.setCacheSummary(models.length, selected?.createdAt);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "读取日期推荐失败";
      for (const view of this.#views.values()) view.setStatus(message, "error");
    }
  }

  private async editProfile(lineageID: string): Promise<void> {
    if (!this.#runtime?.editProfile) return;
    await this.#runtime.editProfile(lineageID);
    await this.refreshProfiles();
  }

  private async updateProfileFlags(
    lineageID: string,
    changes: { readonly locked?: boolean; readonly disabled?: boolean },
  ): Promise<void> {
    if (!this.#runtime?.updateProfileFlags) return;
    await this.#runtime.updateProfileFlags(lineageID, changes);
    await this.refreshProfiles();
  }

  private async mergeProfiles(): Promise<void> {
    if (!this.#runtime?.mergeProfiles) return;
    await this.#runtime.mergeProfiles();
    await this.refreshProfiles();
  }

  private async splitProfile(): Promise<void> {
    if (!this.#runtime?.splitProfile) return;
    await this.#runtime.splitProfile();
    await this.refreshProfiles();
  }

  private async rollbackProfileVersion(): Promise<void> {
    if (!this.#runtime?.rollbackProfileVersion) return;
    await this.#runtime.rollbackProfileVersion();
    await this.refreshProfiles();
  }

  private diagnosticsActions(
    view: RecommendationWorkspaceView,
  ): DiagnosticsViewActions {
    return {
      export: (options) => this.exportDiagnostics(options),
      clearCache: async () => {
        if (!this.#runtime?.clearDerivedCache) return;
        await this.#runtime.clearDerivedCache();
        view.setRecommendations([]);
        view.setHistoryDays([]);
        view.setCacheSummary(0);
        view.setStatus("可推导缓存已清理", "ready");
      },
      rebuildDerivedData: async () => {
        if (!this.#runtime?.rebuildDerivedData) return;
        await this.#runtime.rebuildDerivedData();
        view.setStatus("重建画像任务已加入任务中心", "working");
      },
    };
  }

  private async exportDiagnostics(options: {
    readonly includeSampleContent: boolean;
  }): Promise<void> {
    if (!this.#runtime?.exportDiagnostics) return;
    const win = Zotero.getMainWindow();
    try {
      const path = await this.#runtime.exportDiagnostics(options);
      win?.alert(`诊断已导出：${path}`);
    } catch (error) {
      win?.alert(error instanceof Error ? error.message : "诊断导出失败");
    }
  }
}

export interface RecommendationWorkspaceRuntime {
  isReady(): boolean;
  getArxivCategories?(): readonly string[];
  getProfileOptions(): Promise<readonly RecommendationProfileOption[]>;
  getRecommendationHistory?(): Promise<readonly RecommendationHistoryDay[]>;
  loadRecommendationsForDay?(
    dayKey: string,
    profileIDs?: readonly string[],
  ): Promise<readonly RecommendationCardModel[]>;
  loadCachedModels(): Promise<readonly RecommendationCardModel[]>;
  refresh(
    state: RecommendationToolbarState,
  ): Promise<readonly RecommendationCardModel[]>;
  taskActions(): ConstructorParameters<typeof TaskCenterController>[2];
  getProfileDetails?(): Promise<readonly ProfileEditorRow[]>;
  editProfile?(lineageID: string): Promise<void>;
  updateProfileFlags?(
    lineageID: string,
    changes: { readonly locked?: boolean; readonly disabled?: boolean },
  ): Promise<void>;
  mergeProfiles?(): Promise<void>;
  splitProfile?(): Promise<void>;
  rollbackProfileVersion?(): Promise<void>;
  getDiagnosticsSummary?(): Promise<DiagnosticsExport>;
  exportDiagnostics?(options: {
    readonly includeSampleContent: boolean;
  }): Promise<string>;
  clearDerivedCache?(): Promise<void>;
  rebuildDerivedData?(): Promise<void>;
}

interface RecommendationWorkspaceControllerOptions {
  readonly runtime?: RecommendationWorkspaceRuntime;
  readonly tasks?: OperationTaskRepository;
  readonly profiles?: readonly RecommendationProfileOption[];
  readonly profileDetails?: readonly ProfileEditorRow[];
  readonly historyDays?: readonly RecommendationHistoryDay[];
  readonly initialCount?: number;
}

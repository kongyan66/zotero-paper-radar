export type TaskStatus =
  | "queued"
  | "running"
  | "interrupted"
  | "failed"
  | "completed"
  | "cancelled";

export interface TaskViewModel {
  readonly id: string;
  readonly title: string;
  readonly stage: string;
  readonly status: TaskStatus;
  readonly completed: number;
  readonly total: number;
  readonly targetCount?: number;
  readonly recommendationMetrics?: RecommendationTaskMetrics;
  readonly createdAt?: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cacheHits: number;
  readonly elapsedMs: number;
  readonly lastEvent: string;
  readonly onClear?: () => void | Promise<void>;
  readonly onCancel?: () => void | Promise<void>;
  readonly onResume?: () => void | Promise<void>;
  readonly onRetry?: () => void | Promise<void>;
}

export interface RecommendationTaskMetrics {
  readonly arxivCount?: number;
  readonly candidateCount?: number;
  readonly recommendationCount?: number;
  readonly cacheHits?: number;
  readonly embeddingRequested?: number;
}

type TaskFilter = "running" | "failed" | "completed";

const FILTER_LABELS: Readonly<Record<TaskFilter, string>> = {
  running: "进行中",
  failed: "失败",
  completed: "已完成",
};

const STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  queued: "等待中",
  running: "进行中",
  interrupted: "已中断",
  failed: "失败",
  completed: "已完成",
  cancelled: "已取消",
};

export interface TaskCenterViewOptions {
  readonly onClearHistory?: () => void | Promise<void>;
}

export const TASK_CENTER_COLLAPSE_EVENT = "zad-task-center-collapse";

function html<T extends HTMLElement>(doc: Document, tag: string): T {
  return doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    tag,
  ) as unknown as T;
}

export class TaskCenterView {
  #root?: HTMLElement;
  #list?: HTMLElement;
  #progressDetail?: HTMLElement;
  #progressBar?: HTMLProgressElement;
  #activeFilter: TaskFilter = "running";
  #tasks: readonly TaskViewModel[] = [];
  #collapsed = false;
  #collapseButton?: HTMLButtonElement;
  #rail?: HTMLElement;
  #railMarker?: HTMLElement;
  readonly #doc: Document;

  constructor(
    doc: Document,
    private readonly options: TaskCenterViewOptions = {},
  ) {
    this.#doc = doc;
  }

  mount(parent: Element): HTMLElement {
    const section = html<HTMLElement>(this.#doc, "section");
    section.className = "zad-task-center";
    section.setAttribute("aria-labelledby", "zad-task-center-title");

    const header = html<HTMLElement>(this.#doc, "header");
    header.className = "zad-section-header";
    const title = html<HTMLHeadingElement>(this.#doc, "h2");
    title.id = "zad-task-center-title";
    title.textContent = "任务中心";
    const headerActions = html<HTMLDivElement>(this.#doc, "div");
    headerActions.className = "zad-task-header-actions";
    const collapse = html<HTMLButtonElement>(this.#doc, "button");
    collapse.type = "button";
    collapse.className = "zad-task-collapse";
    collapse.dataset.action = "toggle-task-center";
    collapse.textContent = "折叠";
    collapse.title = "折叠任务中心";
    collapse.addEventListener("click", () =>
      this.setCollapsed(!this.#collapsed),
    );
    this.#collapseButton = collapse;
    headerActions.appendChild(collapse);
    const filters = html<HTMLDivElement>(this.#doc, "div");
    filters.className = "zad-segmented-control";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "任务筛选");
    for (const filter of Object.keys(FILTER_LABELS) as TaskFilter[]) {
      const button = html<HTMLButtonElement>(this.#doc, "button");
      button.type = "button";
      button.dataset.taskFilter = filter;
      button.textContent = FILTER_LABELS[filter];
      button.setAttribute(
        "aria-pressed",
        String(filter === this.#activeFilter),
      );
      button.addEventListener("click", () => this.setFilter(filter));
      filters.appendChild(button);
    }
    header.append(title, headerActions, filters);
    if (this.options.onClearHistory) {
      const clearAll = html<HTMLButtonElement>(this.#doc, "button");
      clearAll.type = "button";
      clearAll.className = "zad-task-clear-all";
      clearAll.dataset.action = "clear-task-history";
      clearAll.title = "清除全部历史任务";
      clearAll.textContent = "一键清空";
      clearAll.addEventListener(
        "click",
        () => void this.options.onClearHistory?.(),
      );
      headerActions.appendChild(clearAll);
    }

    const progress = html<HTMLDivElement>(this.#doc, "div");
    progress.className = "zad-run-progress";
    progress.dataset.role = "run-progress";
    const progressText = html<HTMLDivElement>(this.#doc, "div");
    const progressTitle = html<HTMLElement>(this.#doc, "strong");
    progressTitle.textContent = "当前运行";
    const progressDetail = html<HTMLSpanElement>(this.#doc, "span");
    progressDetail.textContent = "空闲";
    progressText.append(progressTitle, progressDetail);
    const progressBar = html<HTMLProgressElement>(this.#doc, "progress");
    progressBar.max = 1;
    progressBar.value = 0;
    this.#progressDetail = progressDetail;
    this.#progressBar = progressBar;
    progress.append(progressText, progressBar);

    const list = html<HTMLDivElement>(this.#doc, "div");
    list.className = "zad-task-list";
    list.setAttribute("role", "list");
    const rail = html<HTMLDivElement>(this.#doc, "div");
    rail.className = "zad-task-rail";
    rail.dataset.role = "task-rail";
    const marker = html<HTMLSpanElement>(this.#doc, "span");
    marker.className = "zad-task-rail-marker";
    marker.dataset.role = "task-rail-status";
    const expand = html<HTMLButtonElement>(this.#doc, "button");
    expand.type = "button";
    expand.className = "zad-task-rail-expand";
    expand.dataset.action = "expand-task-center";
    expand.textContent = "›";
    expand.title = "展开任务中心";
    expand.setAttribute("aria-label", "展开任务中心");
    expand.addEventListener("click", () => this.setCollapsed(false));
    rail.append(marker, expand);
    this.#rail = rail;
    this.#railMarker = marker;
    this.#root = section;
    this.#list = list;
    section.dataset.collapsed = "false";
    section.append(header, progress, list, rail);
    parent.appendChild(section);
    collapse.setAttribute("aria-expanded", "true");
    rail.hidden = true;
    rail.setAttribute("aria-hidden", "true");
    this.render();
    return section;
  }

  setTasks(tasks: readonly TaskViewModel[]): void {
    this.#tasks = tasks;
    this.renderRail();
    this.render();
  }

  destroy(): void {
    this.#root?.remove();
    this.#root = undefined;
    this.#list = undefined;
    this.#progressDetail = undefined;
    this.#progressBar = undefined;
    this.#collapseButton = undefined;
    this.#rail = undefined;
    this.#railMarker = undefined;
  }

  private setFilter(filter: TaskFilter): void {
    this.#activeFilter = filter;
    for (const button of this.#root?.querySelectorAll("[data-task-filter]") ||
      []) {
      button.setAttribute(
        "aria-pressed",
        String((button as HTMLElement).dataset.taskFilter === filter),
      );
    }
    this.render();
  }

  private render(): void {
    if (!this.#list) return;
    this.renderProgress();
    this.#list.replaceChildren();
    const tasks = this.#tasks.filter((task) => this.matches(task.status));
    const clearAll = this.#root?.querySelector<HTMLButtonElement>(
      "[data-action='clear-task-history']",
    );
    if (clearAll) {
      clearAll.disabled = !this.#tasks.some(
        (task) => task.status !== "queued" && task.status !== "running",
      );
    }
    if (tasks.length === 0) {
      const empty = html<HTMLDivElement>(this.#doc, "div");
      empty.className = "zad-empty-state";
      empty.dataset.role = "task-empty";
      empty.textContent = "暂无任务";
      this.#list.appendChild(empty);
      return;
    }
    for (const task of tasks) {
      this.#list.appendChild(this.createTaskRow(task));
    }
  }

  private setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    if (this.#root) {
      this.#root.dataset.collapsed = String(collapsed);
      for (const child of this.#root.children) {
        const element = child as HTMLElement;
        if (element !== this.#rail) element.hidden = collapsed;
      }
    }
    const content = this.#root?.closest(".zad-workspace-content") as
      | HTMLElement
      | null
      | undefined;
    if (content) content.dataset.taskCollapsed = String(collapsed);
    if (this.#collapseButton) {
      this.#collapseButton.textContent = collapsed ? "展开" : "折叠";
      this.#collapseButton.title = collapsed ? "展开任务中心" : "折叠任务中心";
      this.#collapseButton.setAttribute("aria-expanded", String(!collapsed));
    }
    if (this.#rail) {
      this.#rail.hidden = !collapsed;
      this.#rail.setAttribute("aria-hidden", String(!collapsed));
    }
    this.#root?.dispatchEvent(new Event(TASK_CENTER_COLLAPSE_EVENT));
  }

  private renderRail(): void {
    if (!this.#railMarker) return;
    const task =
      this.#tasks.find((candidate) =>
        ["queued", "running", "interrupted"].includes(candidate.status),
      ) ??
      this.#tasks.find((candidate) => candidate.status === "failed") ??
      this.#tasks.find((candidate) => candidate.status === "completed");
    const status = task?.status ?? "empty";
    this.#railMarker.dataset.status = status;
    this.#railMarker.title = task
      ? `${task.title}：${STATUS_LABELS[task.status]}`
      : "暂无任务";
    this.#rail?.setAttribute(
      "aria-label",
      task ? `${task.title}：${STATUS_LABELS[task.status]}` : "暂无任务",
    );
  }

  private renderProgress(): void {
    if (!this.#progressDetail || !this.#progressBar) return;
    const active = this.#tasks.find((task) =>
      ["queued", "running", "interrupted"].includes(task.status),
    );
    if (!active) {
      this.#progressDetail.textContent = "空闲";
      this.#progressBar.max = 1;
      this.#progressBar.value = 0;
      return;
    }
    this.#progressDetail.textContent = `${active.stage} · 阶段 ${active.completed}/${active.total}`;
    this.#progressBar.max = Math.max(active.total, 1);
    this.#progressBar.value = Math.min(active.completed, active.total);
  }

  private createTaskRow(task: TaskViewModel): HTMLElement {
    const row = html<HTMLElement>(this.#doc, "article");
    row.className = "zad-task-row";
    row.dataset.taskID = task.id;
    row.dataset.taskStatus = task.status;
    row.setAttribute("role", "listitem");

    const header = html<HTMLDivElement>(this.#doc, "div");
    const title = html<HTMLElement>(this.#doc, "strong");
    title.textContent = task.title;
    const status = html<HTMLSpanElement>(this.#doc, "span");
    status.className = "zad-task-status";
    status.textContent = STATUS_LABELS[task.status];
    header.append(title, status);

    const execution = html<HTMLDivElement>(this.#doc, "div");
    execution.className = "zad-task-stage zad-task-execution";
    execution.textContent = `${formatStage(task.stage)} ${task.completed}/${task.total} · ${formatExecutionTime(task)} · ${formatElapsed(task.elapsedMs)}`;
    const progress = html<HTMLProgressElement>(this.#doc, "progress");
    progress.max = Math.max(task.total, 1);
    progress.value = Math.min(task.completed, task.total);
    const detail = html<HTMLDivElement>(this.#doc, "div");
    detail.className = "zad-task-detail";
    const target = task.targetCount ? `目标 ${task.targetCount} 篇 · ` : "";
    detail.textContent = `${target}缓存命中 ${task.cacheHits} · ${task.lastEvent}`;
    const metrics = task.recommendationMetrics
      ? this.createRecommendationMetrics(
          task.recommendationMetrics,
          task.targetCount,
        )
      : undefined;
    const actions = html<HTMLDivElement>(this.#doc, "div");
    actions.className = "zad-task-actions";
    const action =
      task.status === "running" || task.status === "queued"
        ? { label: "取消", callback: task.onCancel }
        : task.status === "interrupted"
          ? { label: "继续", callback: task.onResume }
          : task.status === "failed"
            ? { label: "重试", callback: task.onRetry }
            : undefined;
    if (action?.callback) {
      const button = html<HTMLButtonElement>(this.#doc, "button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => void action.callback?.());
      actions.appendChild(button);
    }
    if (task.onClear) {
      const clear = html<HTMLButtonElement>(this.#doc, "button");
      clear.type = "button";
      clear.dataset.action = "clear-task";
      clear.textContent = "清除";
      clear.title = "清除任务记录";
      clear.addEventListener("click", () => void task.onClear?.());
      actions.appendChild(clear);
    }
    row.append(header, execution, progress);
    if (metrics) row.appendChild(metrics);
    if (!metrics || task.status === "failed") row.appendChild(detail);
    row.appendChild(actions);
    return row;
  }

  private createRecommendationMetrics(
    metrics: RecommendationTaskMetrics,
    targetCount?: number,
  ): HTMLElement {
    const block = html<HTMLDivElement>(this.#doc, "div");
    block.className = "zad-task-metrics";
    block.dataset.role = "recommendation-metrics";
    block.append(
      this.createMetricLine(
        [
          ["检索", metrics.arxivCount],
          ["候选", metrics.candidateCount],
          ["推荐", metrics.recommendationCount],
        ],
        "recommendation-flow",
      ),
      this.createMetricLine(
        [
          ["向量复用", metrics.cacheHits],
          ["新计算", metrics.embeddingRequested],
          ["目标", targetCount],
        ],
        "embedding-flow",
      ),
    );
    return block;
  }

  private createMetricLine(
    values: readonly (readonly [string, number | undefined])[],
    role: string,
  ): HTMLElement {
    const line = html<HTMLDivElement>(this.#doc, "div");
    line.className = "zad-task-metric-line";
    line.dataset.role = role;
    line.textContent = values
      .map(
        ([label, value]) => `${label} ${value === undefined ? "--" : value}篇`,
      )
      .join(" · ");
    return line;
  }

  private matches(status: TaskStatus): boolean {
    if (this.#activeFilter === "running") {
      return ["queued", "running", "interrupted"].includes(status);
    }
    if (this.#activeFilter === "failed") return status === "failed";
    return status === "completed" || status === "cancelled";
  }
}

function formatElapsed(elapsedMs: number): string {
  if (elapsedMs < 1000) return `${elapsedMs} ms`;
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}

function formatExecutionTime(task: TaskViewModel): string {
  const started = parseDate(task.startedAt);
  const completed = parseDate(task.completedAt);
  if (task.startedAt && task.completedAt) {
    if (started && completed && sameLocalDay(started, completed)) {
      return `${formatShortDate(started)} ${formatShortTime(started)}–${formatShortTime(completed)}`;
    }
    return `${formatDateTime(task.startedAt)}–${formatDateTime(task.completedAt)}`;
  }
  if (started)
    return `${formatShortDate(started)} ${formatShortTime(started)} 开始`;
  const created = parseDate(task.createdAt);
  if (created)
    return `${formatShortDate(created)} ${formatShortTime(created)} 创建`;
  return "时间未记录";
}

function formatDateTime(value?: string): string {
  const date = parseDate(value);
  return date ? `${formatShortDate(date)} ${formatShortTime(date)}` : "未记录";
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatShortDate(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatShortTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function sameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatStage(stage: string): string {
  return stage === "completed" ? "流程" : stage;
}

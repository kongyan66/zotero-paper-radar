import type {
  OperationTaskRecord,
  OperationTaskRepository,
} from "../../infrastructure/storage/operationTaskRepository.ts";
import {
  TaskCenterView,
  type RecommendationTaskMetrics,
  type TaskViewModel,
} from "./taskCenter.ts";

export interface TaskCenterActions {
  cancel(taskID: string): void | Promise<void>;
  resume(taskID: string): void | Promise<void>;
  retry(taskID: string): void | Promise<void>;
}

export interface TaskCenterControllerOptions {
  onTaskUpdated?: (task: OperationTaskRecord) => void | Promise<void>;
}

export class TaskCenterController {
  readonly #doc: Document;
  readonly #repository: OperationTaskRepository;
  readonly #actions: TaskCenterActions;
  readonly #options: TaskCenterControllerOptions;
  #view?: TaskCenterView;
  #unsubscribe?: () => void;
  #refreshPromise: Promise<void> = Promise.resolve();

  constructor(
    doc: Document,
    repository: OperationTaskRepository,
    actions: TaskCenterActions,
    options: TaskCenterControllerOptions = {},
  ) {
    this.#doc = doc;
    this.#repository = repository;
    this.#actions = actions;
    this.#options = options;
  }

  async mount(
    parent: Element,
    options: { readonly initialRefresh?: boolean } = {},
  ): Promise<void> {
    this.#view = new TaskCenterView(this.#doc, {
      onClearHistory: () => this.clearHistory(),
    });
    this.#view.mount(parent);
    this.#unsubscribe = this.#repository.subscribe((task) => {
      this.scheduleRefresh();
      void Promise.resolve(this.#options.onTaskUpdated?.(task)).catch(
        () => undefined,
      );
    });
    if (options.initialRefresh !== false) {
      await this.refresh().catch(() => undefined);
    }
  }

  async refreshNow(): Promise<void> {
    await this.refresh().catch(() => undefined);
  }

  destroy(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#view?.destroy();
    this.#view = undefined;
  }

  private async refresh(): Promise<void> {
    const tasks = await this.#repository.list();
    if (!this.#view) return;
    this.#view.setTasks(tasks.map((task) => this.toViewModel(task)));
  }

  private scheduleRefresh(): void {
    this.#refreshPromise = this.#refreshPromise
      .then(() => this.refresh())
      .catch(() => undefined);
  }

  private toViewModel(task: OperationTaskRecord): TaskViewModel {
    const checkpoint = task.checkpoint;
    return {
      id: task.taskID,
      title:
        task.taskType === "recommendation"
          ? "今日推荐"
          : task.taskType === "build-profile"
            ? "兴趣画像"
            : task.taskType === "import"
              ? "论文入库"
              : task.taskType,
      stage: task.stage,
      status: task.status,
      completed: task.completed,
      total: task.total,
      ...(task.taskType === "recommendation"
        ? {
            targetCount: recommendationTargetCount(checkpoint),
            recommendationMetrics: recommendationMetrics(checkpoint),
          }
        : {}),
      ...(task.createdAt ? { createdAt: task.createdAt } : {}),
      ...(task.startedAt ? { startedAt: task.startedAt } : {}),
      ...(!isActiveTask(task.status)
        ? { completedAt: task.completedAt ?? task.updatedAt }
        : {}),
      cacheHits:
        typeof checkpoint.cacheHits === "number" ? checkpoint.cacheHits : 0,
      elapsedMs: elapsed(task),
      lastEvent:
        task.errorMessage ??
        (task.status === "completed" ? "已完成" : "等待操作"),
      ...(!isActiveTask(task.status)
        ? { onClear: () => this.clearTask(task.taskID) }
        : {}),
      onCancel: ["queued", "running"].includes(task.status)
        ? () => this.#actions.cancel(task.taskID)
        : undefined,
      onResume:
        task.status === "interrupted"
          ? () => this.#actions.resume(task.taskID)
          : undefined,
      onRetry:
        task.status === "failed"
          ? () => this.#actions.retry(task.taskID)
          : undefined,
    };
  }

  private async clearTask(taskID: string): Promise<void> {
    await this.#repository.clearHistoryTask(taskID);
    await this.refresh();
  }

  private async clearHistory(): Promise<void> {
    const confirmed = this.#doc.defaultView?.confirm?.(
      "确定清除全部历史任务吗？运行中和排队任务不会被清除。",
    );
    if (confirmed === false) return;
    await this.#repository.clearHistory();
    await this.refresh();
  }
}

function recommendationMetrics(
  checkpoint: Readonly<Record<string, unknown>>,
): RecommendationTaskMetrics {
  const completedStage = checkpoint.completedStage;
  const storedCandidateCount = metricCount(checkpoint.candidateCount);
  const runCandidateCount = metricCount(checkpoint.runCandidateCount);
  const legacyCompletedRun =
    runCandidateCount === undefined &&
    (completedStage === "rerank" || completedStage === "summary");
  return {
    ...optionalMetric("arxivCount", metricCount(checkpoint.arxivCount)),
    ...optionalMetric(
      "candidateCount",
      legacyCompletedRun ? undefined : storedCandidateCount,
    ),
    ...optionalMetric(
      "recommendationCount",
      runCandidateCount ??
        (legacyCompletedRun ? storedCandidateCount : undefined),
    ),
    ...optionalMetric("cacheHits", metricCount(checkpoint.cacheHits)),
    ...optionalMetric(
      "embeddingRequested",
      metricCount(checkpoint.embeddingRequested),
    ),
  };
}

function metricCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : undefined;
}

function optionalMetric<K extends keyof RecommendationTaskMetrics>(
  key: K,
  value: number | undefined,
): Pick<RecommendationTaskMetrics, K> | Record<never, never> {
  return value === undefined
    ? {}
    : ({ [key]: value } as Pick<RecommendationTaskMetrics, K>);
}

function isActiveTask(status: OperationTaskRecord["status"]): boolean {
  return status === "queued" || status === "running";
}

function recommendationTargetCount(
  checkpoint: Readonly<Record<string, unknown>>,
): number | undefined {
  const query = checkpoint.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) {
    return undefined;
  }
  const count = (query as Record<string, unknown>).count;
  return typeof count === "number" && Number.isFinite(count)
    ? Math.min(30, Math.max(1, Math.round(count)))
    : undefined;
}

function elapsed(task: OperationTaskRecord): number {
  const end = task.completedAt
    ? Date.parse(task.completedAt)
    : Date.parse(task.updatedAt);
  const start = task.startedAt
    ? Date.parse(task.startedAt)
    : Date.parse(task.createdAt);
  return Number.isFinite(end - start) ? Math.max(0, end - start) : 0;
}

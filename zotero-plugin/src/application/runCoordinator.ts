import { createAbortController } from "../infrastructure/network/abortController.ts";
import type {
  OperationTaskRecord,
  OperationTaskRepository,
  OperationTaskStatus,
} from "../infrastructure/storage/operationTaskRepository.ts";

export const RECOMMENDATION_STAGES = [
  "corpus-check",
  "profile",
  "arxiv",
  "candidate-embedding",
  "scoring",
  "rerank",
  "summary",
] as const;

export interface RunStage {
  readonly name: string;
  run(context: {
    readonly task: OperationTaskRecord;
    readonly checkpoint: Readonly<Record<string, unknown>>;
    readonly signal: AbortSignal;
    report(
      completed: number,
      total: number,
      checkpoint?: Readonly<Record<string, unknown>>,
    ): Promise<void>;
  }): Promise<Readonly<Record<string, unknown>> | void>;
}

export interface RunResult {
  readonly taskID: string;
  readonly status: OperationTaskStatus;
  readonly checkpoint: Readonly<Record<string, unknown>>;
}

export class RunCoordinator {
  readonly #tasks: OperationTaskRepositoryLike;
  readonly #active = new Map<string, AbortController>();
  readonly #now: () => string;

  constructor(options: {
    readonly tasks: OperationTaskRepositoryLike;
    readonly now?: () => string;
  }) {
    this.#tasks = options.tasks;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async start(input: {
    readonly taskID: string;
    readonly taskType: string;
    readonly stages: readonly RunStage[];
    readonly total?: number;
    readonly relatedRunID?: string;
    readonly checkpoint?: Readonly<Record<string, unknown>>;
  }): Promise<RunResult> {
    this.assertSingleActive(input.taskType);
    const task = await this.#tasks.create({
      taskID: input.taskID,
      taskType: input.taskType,
      total: input.total ?? input.stages.length,
      relatedRunID: input.relatedRunID,
      checkpoint: input.checkpoint,
      now: this.#now(),
    });
    return this.execute(task, input.stages);
  }

  async resume(
    taskID: string,
    stages: readonly RunStage[],
  ): Promise<RunResult> {
    const task = await this.#tasks.get(taskID);
    if (!task) throw new Error(`Unknown task ${taskID}`);
    if (!(task.status === "interrupted" || task.status === "failed")) {
      throw new Error("只有中断或失败任务可以继续");
    }
    this.assertSingleActive(task.taskType);
    return this.execute(task, stages);
  }

  async cancel(taskID: string): Promise<void> {
    const controller = this.#active.get(taskID);
    if (controller) controller.abort();
    else {
      const task = await this.#tasks.get(taskID);
      if (task && (task.status === "queued" || task.status === "interrupted")) {
        await this.#tasks.update(taskID, {
          status: "cancelled",
          now: this.#now(),
        });
      }
    }
  }

  async markInterrupted(): Promise<number> {
    return this.#tasks.markRunningInterrupted(this.#now());
  }

  private async execute(
    task: OperationTaskRecord,
    stages: readonly RunStage[],
  ): Promise<RunResult> {
    const controller = createAbortController();
    this.#active.set(task.taskID, controller);
    let current = task;
    let checkpoint = task.checkpoint;
    try {
      current = await this.#tasks.update(task.taskID, {
        status: "running",
        stage:
          current.stage === "queued" || current.stage === "interrupted"
            ? (stages[0]?.name ?? "running")
            : current.stage,
        startedAt: current.startedAt ?? this.#now(),
        errorCode: null,
        errorMessage: null,
        now: this.#now(),
      });
      const startIndex = findStartIndex(stages, current.stage);
      for (let index = startIndex; index < stages.length; index += 1) {
        controller.signal.throwIfAborted?.();
        const stage = stages[index];
        current = await this.#tasks.update(task.taskID, {
          status: "running",
          stage: stage.name,
          completed: index,
          total: stages.length,
          now: this.#now(),
        });
        const result = await stage.run({
          task: current,
          checkpoint,
          signal: controller.signal,
          report: async (completed, total, nextCheckpoint) => {
            if (nextCheckpoint)
              checkpoint = { ...checkpoint, ...nextCheckpoint };
            await this.#tasks.update(task.taskID, {
              status: "running",
              stage: stage.name,
              completed,
              total,
              checkpoint,
              now: this.#now(),
            });
          },
        });
        checkpoint = {
          ...checkpoint,
          ...(result ?? {}),
          completedStage: stage.name,
        };
        current = await this.#tasks.update(task.taskID, {
          status: "running",
          stage: stage.name,
          completed: index + 1,
          total: stages.length,
          checkpoint,
          now: this.#now(),
        });
      }
      current = await this.#tasks.update(task.taskID, {
        status: "completed",
        stage: "completed",
        completed: stages.length,
        total: stages.length,
        checkpoint,
        completedAt: this.#now(),
        now: this.#now(),
      });
      return {
        taskID: current.taskID,
        status: current.status,
        checkpoint: current.checkpoint,
      };
    } catch (error) {
      const cancelled = controller.signal.aborted || isAbortError(error);
      current = await this.#tasks.update(task.taskID, {
        status: cancelled ? "cancelled" : "failed",
        stage: cancelled ? "cancelled" : current.stage,
        checkpoint,
        errorCode: cancelled ? null : "run-failed",
        errorMessage: cancelled ? null : safeErrorMessage(error),
        completedAt: cancelled ? this.#now() : null,
        now: this.#now(),
      });
      return {
        taskID: current.taskID,
        status: current.status,
        checkpoint: current.checkpoint,
      };
    } finally {
      this.#active.delete(task.taskID);
    }
  }

  private assertSingleActive(taskType: string): void {
    for (const taskID of this.#active.keys()) {
      void taskID;
      throw new Error(`已有 ${taskType} 或其他运行任务正在执行`);
    }
  }
}

export interface OperationTaskRepositoryLike {
  create(input: {
    readonly taskID: string;
    readonly taskType: string;
    readonly total: number;
    readonly checkpoint?: Readonly<Record<string, unknown>>;
    readonly relatedRunID?: string;
    readonly now?: string;
  }): Promise<OperationTaskRecord>;
  get(taskID: string): Promise<OperationTaskRecord | undefined>;
  update(
    taskID: string,
    patch: Parameters<OperationTaskRepository["update"]>[1],
  ): Promise<OperationTaskRecord>;
  markRunningInterrupted(now?: string): Promise<number>;
}

function findStartIndex(
  stages: readonly RunStage[],
  stageName: string,
): number {
  if (stageName === "queued" || stageName === "interrupted") return 0;
  const index = stages.findIndex((stage) => stage.name === stageName);
  return index < 0 ? 0 : index;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || /cancel/i.test(error.message))
  );
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "任务执行失败";
}

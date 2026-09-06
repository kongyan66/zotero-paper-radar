import type { PluginDatabase } from "./pluginDatabase.ts";

export type OperationTaskStatus =
  | "queued"
  | "running"
  | "interrupted"
  | "failed"
  | "completed"
  | "cancelled";

export interface OperationTaskRecord {
  readonly taskID: string;
  readonly taskType: string;
  readonly status: OperationTaskStatus;
  readonly stage: string;
  readonly completed: number;
  readonly total: number;
  readonly checkpoint: Readonly<Record<string, unknown>>;
  readonly retryCount: number;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly relatedRunID?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export type OperationTaskListener = (
  task: OperationTaskRecord,
) => void | Promise<void>;

interface OperationTaskRow {
  task_id: string;
  task_type: string;
  status: OperationTaskStatus;
  stage: string;
  completed: number;
  total: number;
  checkpoint_json: string;
  retry_count: number;
  error_code: string | null;
  error_message: string | null;
  related_run_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export class OperationTaskRepository {
  readonly #database: PluginDatabase;
  readonly #listeners = new Set<OperationTaskListener>();

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async create(input: {
    readonly taskID: string;
    readonly taskType: string;
    readonly total: number;
    readonly checkpoint?: Readonly<Record<string, unknown>>;
    readonly relatedRunID?: string;
    readonly now?: string;
  }): Promise<OperationTaskRecord> {
    const now = input.now ?? new Date().toISOString();
    await this.connection().queryAsync(
      `INSERT INTO operation_tasks (
        task_id, task_type, status, stage, completed, total, checkpoint_json,
        retry_count, related_run_id, created_at, updated_at
      ) VALUES (?, ?, 'queued', 'queued', 0, ?, ?, 0, ?, ?, ?)`,
      [
        input.taskID,
        input.taskType,
        Math.max(0, input.total),
        JSON.stringify(input.checkpoint ?? {}),
        input.relatedRunID ?? null,
        now,
        now,
      ],
    );
    const task = await this.get(input.taskID);
    if (!task) throw new Error(`Failed to create task ${input.taskID}`);
    await this.notify(task);
    return task;
  }

  async get(taskID: string): Promise<OperationTaskRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM operation_tasks WHERE task_id = ?",
      taskID,
    )) as OperationTaskRow | false;
    return row ? decodeTask(row) : undefined;
  }

  async list(
    status?: OperationTaskStatus,
  ): Promise<readonly OperationTaskRecord[]> {
    const rows = (await this.connection().queryAsync(
      status
        ? "SELECT * FROM operation_tasks WHERE status = ? ORDER BY updated_at DESC"
        : "SELECT * FROM operation_tasks ORDER BY updated_at DESC",
      status ? [status] : undefined,
    )) as OperationTaskRow[] | undefined;
    return (rows ?? []).map(decodeTask);
  }

  async update(
    taskID: string,
    patch: {
      readonly status?: OperationTaskStatus;
      readonly stage?: string;
      readonly completed?: number;
      readonly total?: number;
      readonly checkpoint?: Readonly<Record<string, unknown>>;
      readonly retryCount?: number;
      readonly errorCode?: string | null;
      readonly errorMessage?: string | null;
      readonly startedAt?: string | null;
      readonly completedAt?: string | null;
      readonly now?: string;
    },
  ): Promise<OperationTaskRecord> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    add("status", patch.status);
    add("stage", patch.stage);
    add("completed", patch.completed);
    add("total", patch.total);
    add(
      "checkpoint_json",
      patch.checkpoint === undefined
        ? undefined
        : JSON.stringify(patch.checkpoint),
    );
    add("retry_count", patch.retryCount);
    add("error_code", patch.errorCode);
    add("error_message", patch.errorMessage);
    add("started_at", patch.startedAt);
    add("completed_at", patch.completedAt);
    add("updated_at", patch.now ?? new Date().toISOString());
    if (!assignments.length) throw new Error("Task update cannot be empty");
    values.push(taskID);
    await this.connection().queryAsync(
      `UPDATE operation_tasks SET ${assignments.join(", ")} WHERE task_id = ?`,
      values,
    );
    const task = await this.get(taskID);
    if (!task) throw new Error(`Unknown task ${taskID}`);
    await this.notify(task);
    return task;

    function add(column: string, value: unknown): void {
      if (value === undefined) return;
      assignments.push(`${column} = ?`);
      values.push(value);
    }
  }

  async markRunningInterrupted(
    now = new Date().toISOString(),
  ): Promise<number> {
    await this.connection().queryAsync(
      `UPDATE operation_tasks
       SET status = 'interrupted', stage = 'interrupted', updated_at = ?
       WHERE status = 'running'`,
      now,
    );
    return Number(await this.connection().valueQueryAsync("SELECT changes()"));
  }

  async clearHistoryTask(taskID: string): Promise<boolean> {
    const task = await this.get(taskID);
    if (!task) return false;
    if (isActiveTask(task.status)) {
      throw new Error("运行中或排队任务不能清除，请先取消任务");
    }
    await this.connection().queryAsync(
      `DELETE FROM operation_tasks
       WHERE task_id = ? AND status NOT IN ('queued', 'running')`,
      taskID,
    );
    return (
      Number(await this.connection().valueQueryAsync("SELECT changes()")) > 0
    );
  }

  async clearHistory(): Promise<number> {
    await this.connection().queryAsync(
      "DELETE FROM operation_tasks WHERE status NOT IN ('queued', 'running')",
    );
    return Number(await this.connection().valueQueryAsync("SELECT changes()"));
  }

  subscribe(listener: OperationTaskListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private async notify(task: OperationTaskRecord): Promise<void> {
    for (const listener of this.#listeners) await listener(task);
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

function isActiveTask(status: OperationTaskStatus): boolean {
  return status === "queued" || status === "running";
}

function decodeTask(row: OperationTaskRow): OperationTaskRecord {
  let checkpoint: Readonly<Record<string, unknown>> = {};
  try {
    const parsed = JSON.parse(row.checkpoint_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      checkpoint = parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    checkpoint = {};
  }
  return {
    taskID: row.task_id,
    taskType: row.task_type,
    status: row.status,
    stage: row.stage,
    completed: row.completed,
    total: row.total,
    checkpoint,
    retryCount: row.retry_count,
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    ...(row.error_message ? { errorMessage: row.error_message } : {}),
    ...(row.related_run_id ? { relatedRunID: row.related_run_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

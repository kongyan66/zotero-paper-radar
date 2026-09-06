import type { ImportCoreStatus } from "../../domain/importing/importStateMachine.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export interface ImportTaskRecord {
  readonly taskID: string;
  readonly stableIntentKey: string;
  readonly arxivID: string;
  readonly coreStatus: ImportCoreStatus;
  readonly attachmentStatus:
    | "not-requested"
    | "queued"
    | "running"
    | "completed"
    | "failed";
  readonly zoteroItemKey?: string;
  readonly targetCollectionKey?: string;
  readonly feedbackEventID?: string;
  readonly errorCode?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class ImportTaskRepository {
  readonly #database: PluginDatabase;

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async getByIntent(
    stableIntentKey: string,
  ): Promise<ImportTaskRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM import_tasks WHERE stable_intent_key = ?",
      stableIntentKey,
    )) as ImportTaskRow | false;
    return row ? decode(row) : undefined;
  }

  async get(taskID: string): Promise<ImportTaskRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM import_tasks WHERE task_id = ?",
      taskID,
    )) as ImportTaskRow | false;
    return row ? decode(row) : undefined;
  }

  async create(input: {
    readonly taskID: string;
    readonly stableIntentKey: string;
    readonly arxivID: string;
    readonly now?: string;
  }): Promise<ImportTaskRecord> {
    const now = input.now ?? new Date().toISOString();
    await this.connection().executeTransaction(async () => {
      await this.connection().queryAsync(
        `INSERT OR IGNORE INTO operation_tasks (
          task_id, task_type, status, stage, completed, total, checkpoint_json,
          retry_count, created_at, updated_at
        ) VALUES (?, 'import', 'queued', 'queued', 0, 1, '{}', 0, ?, ?)`,
        [input.taskID, now, now],
      );
      await this.connection().queryAsync(
        `INSERT OR IGNORE INTO import_tasks (
          task_id, stable_intent_key, arxiv_id, core_status, attachment_status,
          created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', 'not-requested', ?, ?)`,
        [input.taskID, input.stableIntentKey, input.arxivID, now, now],
      );
    });
    const task = await this.getByIntent(input.stableIntentKey);
    if (!task) throw new Error("无法创建入库任务");
    return task;
  }

  async update(
    taskID: string,
    patch: {
      readonly coreStatus?: ImportCoreStatus;
      readonly attachmentStatus?: ImportTaskRecord["attachmentStatus"];
      readonly zoteroItemKey?: string | null;
      readonly targetCollectionKey?: string | null;
      readonly feedbackEventID?: string | null;
      readonly errorCode?: string | null;
      readonly now?: string;
    },
  ): Promise<ImportTaskRecord> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    const now = patch.now ?? new Date().toISOString();
    add("core_status", patch.coreStatus);
    add("attachment_status", patch.attachmentStatus);
    add("zotero_item_key", patch.zoteroItemKey);
    add("target_collection_key", patch.targetCollectionKey);
    add("feedback_event_id", patch.feedbackEventID);
    add("error_code", patch.errorCode);
    add("updated_at", now);
    values.push(taskID);
    await this.connection().executeTransaction(async () => {
      await this.connection().queryAsync(
        `UPDATE import_tasks SET ${assignments.join(", ")} WHERE task_id = ?`,
        values,
      );
      const operationStatus = statusFor(
        patch.coreStatus,
        patch.attachmentStatus,
      );
      const operationStage = stageFor(patch.coreStatus, patch.attachmentStatus);
      await this.connection().queryAsync(
        `UPDATE operation_tasks
         SET status = COALESCE(?, status), stage = COALESCE(?, stage),
             completed = CASE
               WHEN ? = 'completed' THEN total
               WHEN ? = 'running' THEN 0
               ELSE completed
             END,
             error_code = CASE WHEN ? = 1 THEN ? ELSE error_code END,
             updated_at = ?
         WHERE task_id = ?`,
        [
          operationStatus,
          operationStage,
          operationStatus,
          operationStatus,
          patch.errorCode === undefined ? 0 : 1,
          patch.errorCode ?? null,
          now,
          taskID,
        ],
      );
    });
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM import_tasks WHERE task_id = ?",
      taskID,
    )) as ImportTaskRow | false;
    if (!row) throw new Error(`未知入库任务 ${taskID}`);
    return decode(row);

    function add(column: string, value: unknown): void {
      if (value === undefined) return;
      assignments.push(`${column} = ?`);
      values.push(value);
    }
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

function statusFor(
  coreStatus: ImportCoreStatus | undefined,
  attachmentStatus: ImportTaskRecord["attachmentStatus"] | undefined,
): string | null {
  if (attachmentStatus === "failed") return "failed";
  if (attachmentStatus === "queued" || attachmentStatus === "running") {
    return "running";
  }
  if (attachmentStatus === "completed" && coreStatus === undefined) {
    return "completed";
  }
  if (!coreStatus) return null;
  if (coreStatus === "completed") return "completed";
  if (coreStatus === "conflict" || coreStatus === "failed") return "failed";
  return "running";
}

function stageFor(
  coreStatus: ImportCoreStatus | undefined,
  attachmentStatus: ImportTaskRecord["attachmentStatus"] | undefined,
): string | null {
  if (attachmentStatus === "failed") {
    return "completed_with_attachment_error";
  }
  if (attachmentStatus === "queued" || attachmentStatus === "running") {
    return "attachment";
  }
  if (attachmentStatus === "completed") return "completed";
  return coreStatus ?? null;
}

interface ImportTaskRow {
  task_id: string;
  stable_intent_key: string;
  arxiv_id: string;
  core_status: ImportCoreStatus;
  attachment_status: ImportTaskRecord["attachmentStatus"];
  zotero_item_key: string | null;
  target_collection_key: string | null;
  feedback_event_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}

function decode(row: ImportTaskRow): ImportTaskRecord {
  return {
    taskID: row.task_id,
    stableIntentKey: row.stable_intent_key,
    arxivID: row.arxiv_id,
    coreStatus: row.core_status,
    attachmentStatus: row.attachment_status,
    ...(row.zotero_item_key ? { zoteroItemKey: row.zotero_item_key } : {}),
    ...(row.target_collection_key
      ? { targetCollectionKey: row.target_collection_key }
      : {}),
    ...(row.feedback_event_id
      ? { feedbackEventID: row.feedback_event_id }
      : {}),
    ...(row.error_code ? { errorCode: row.error_code } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

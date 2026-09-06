import type { PluginDatabase } from "./pluginDatabase.ts";
import {
  formatHistoryDayLabel,
  localDayKey,
  recommendationHistoryStart,
  type RecommendationHistoryDay,
} from "../../domain/recommendations/recommendationHistory.ts";

export interface RecommendationRunRecord {
  readonly runID: string;
  readonly queryScope: Readonly<Record<string, unknown>>;
  readonly targetProfileIDs: readonly string[];
  readonly candidateCount: number;
  readonly generationID: string;
  readonly profileVersionID: string;
  readonly weightVersionID?: string;
  readonly status: string;
  readonly createdAt: string;
  readonly completedAt?: string;
}

export class RecommendationRepository {
  readonly #database: PluginDatabase;

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async createRun(input: {
    readonly runID: string;
    readonly queryScope: Readonly<Record<string, unknown>>;
    readonly targetProfileIDs: readonly string[];
    readonly generationID: string;
    readonly profileVersionID: string;
    readonly weightVersionID?: string;
    readonly now?: string;
  }): Promise<void> {
    const now = input.now ?? new Date().toISOString();
    await this.connection().queryAsync(
      `INSERT INTO recommendation_runs (
        run_id, query_scope_json, target_profile_ids_json, candidate_count,
        stage_timings_json, generation_id, profile_version_id, weight_version_id,
        status, created_at
      ) VALUES (?, ?, ?, 0, '{}', ?, ?, ?, 'draft', ?)`,
      [
        input.runID,
        JSON.stringify(input.queryScope),
        JSON.stringify(input.targetProfileIDs),
        input.generationID,
        input.profileVersionID,
        input.weightVersionID ?? null,
        now,
      ],
    );
  }

  async completeRun(
    runID: string,
    stageTimings: Readonly<Record<string, number>> = {},
    now = new Date().toISOString(),
  ): Promise<void> {
    await this.connection().queryAsync(
      `UPDATE recommendation_runs
       SET status = 'published', stage_timings_json = ?, completed_at = ?
       WHERE run_id = ?`,
      [JSON.stringify(stageTimings), now, runID],
    );
  }

  async failRun(runID: string, now = new Date().toISOString()): Promise<void> {
    await this.connection().queryAsync(
      "UPDATE recommendation_runs SET status = 'failed', completed_at = ? WHERE run_id = ?",
      [now, runID],
    );
  }

  async latestPublished(): Promise<RecommendationRunRecord | undefined> {
    return (await this.listPublishedRunsSince())[0];
  }

  async listPublishedRunsSince(
    since?: string,
  ): Promise<readonly RecommendationRunRecord[]> {
    const rows = (await this.connection().queryAsync(
      since
        ? `SELECT * FROM recommendation_runs
           WHERE status = 'published' AND candidate_count > 0 AND created_at >= ?
           ORDER BY created_at DESC, run_id DESC`
        : `SELECT * FROM recommendation_runs
           WHERE status = 'published' AND candidate_count > 0
           ORDER BY created_at DESC, run_id DESC`,
      since ? [since] : undefined,
    )) as RecommendationRunRow[] | undefined;
    return (rows ?? []).map(decodeRecommendationRun);
  }

  async listHistoryDays(
    now: Date,
    days = 7,
  ): Promise<readonly RecommendationHistoryDay[]> {
    const runs = await this.listPublishedRunsSince(
      recommendationHistoryStart(now, days).toISOString(),
    );
    const latestByDay = new Map<string, RecommendationRunRecord>();
    for (const run of runs) {
      const dayKey = localDayKey(run.createdAt) ?? run.createdAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
      if (!latestByDay.has(dayKey)) latestByDay.set(dayKey, run);
    }
    return [...latestByDay.entries()].map(([dayKey, run]) => ({
      dayKey,
      label: formatHistoryDayLabel(dayKey, now),
      candidateCount: run.candidateCount,
      runID: run.runID,
      createdAt: run.createdAt,
    }));
  }

  async pruneBefore(cutoff: string): Promise<number> {
    await this.connection().queryAsync(
      `DELETE FROM recommendation_runs
       WHERE created_at < ?
         AND status IN ('published', 'failed')
         AND NOT EXISTS (
           SELECT 1 FROM operation_tasks
           WHERE operation_tasks.related_run_id = recommendation_runs.run_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM feedback_events
           WHERE feedback_events.run_id = recommendation_runs.run_id
         )`,
      cutoff,
    );
    return Number(await this.connection().valueQueryAsync("SELECT changes()"));
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

interface RecommendationRunRow {
  run_id: string;
  query_scope_json: string;
  target_profile_ids_json: string;
  candidate_count: number;
  generation_id: string;
  profile_version_id: string;
  weight_version_id: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

function decodeRecommendationRun(
  row: RecommendationRunRow,
): RecommendationRunRecord {
  return {
    runID: row.run_id,
    queryScope: JSON.parse(row.query_scope_json) as Readonly<
      Record<string, unknown>
    >,
    targetProfileIDs: JSON.parse(
      row.target_profile_ids_json,
    ) as readonly string[],
    candidateCount: row.candidate_count,
    generationID: row.generation_id,
    profileVersionID: row.profile_version_id,
    ...(row.weight_version_id
      ? { weightVersionID: row.weight_version_id }
      : {}),
    status: row.status,
    createdAt: row.created_at,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
  };
}

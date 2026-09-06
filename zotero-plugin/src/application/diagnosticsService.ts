import {
  createDiagnosticsExport,
  type DiagnosticsExport,
  type DiagnosticsSnapshot,
  type RunLogger,
} from "../infrastructure/diagnostics/runLogger.ts";
import type { PluginDatabase } from "../infrastructure/storage/pluginDatabase.ts";

export class DiagnosticsService {
  readonly #database: PluginDatabase;
  readonly #logger: RunLogger;

  constructor(database: PluginDatabase, logger: RunLogger) {
    this.#database = database;
    this.#logger = logger;
  }

  async export(
    environment: Readonly<Record<string, unknown>> = {},
    options: {
      readonly includeSampleContent?: boolean;
      readonly generatedAt?: string;
    } = {},
  ): Promise<DiagnosticsExport> {
    return createDiagnosticsExport(
      await this.snapshot(environment),
      this.#logger,
      options,
    );
  }

  async snapshot(
    environment: Readonly<Record<string, unknown>> = {},
  ): Promise<DiagnosticsSnapshot> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    // Zotero's DBConnection is serialized by the host. Keep the diagnostics
    // snapshot sequential even though these reads are logically independent.
    const profiles = await connection.queryAsync(
      `SELECT profile_version_id, lineage_id, profile_type, priority, sort_order,
              statistics_json
       FROM profiles ORDER BY profile_version_id, sort_order`,
    );
    const candidates = await connection.queryAsync(
      `SELECT run_id, arxiv_id, profile_scores_json, score_components_json,
              final_score, rank, display_status
       FROM recommendation_candidates ORDER BY run_id, rank`,
    );
    const feedback = await connection.queryAsync(
      `SELECT event_id, arxiv_id, event_type, run_id, candidate_rank, created_at
       FROM feedback_events ORDER BY created_at, event_id`,
    );
    const operations = await connection.queryAsync(
      `SELECT task_id, task_type, status, stage, completed, total, retry_count,
              error_code, related_run_id, created_at, updated_at, started_at,
              completed_at
       FROM operation_tasks ORDER BY created_at, task_id`,
    );
    const runs = await connection.queryAsync(
      `SELECT run_id, candidate_count, generation_id, profile_version_id,
              weight_version_id, status, stage_timings_json, created_at,
              completed_at
       FROM recommendation_runs ORDER BY created_at, run_id`,
    );
    const profileRows = normalizeRows(profiles, [
      "profile_version_id",
      "lineage_id",
      "profile_type",
      "priority",
      "sort_order",
      "statistics_json",
    ]);
    return {
      environment,
      profiles: profileRows,
      recentProfiles: profileRows.filter(
        (profile) => profile.profile_type === "recent",
      ),
      longTermProfiles: profileRows.filter(
        (profile) => profile.profile_type === "long-term",
      ),
      candidates: normalizeRows(candidates, [
        "run_id",
        "arxiv_id",
        "profile_scores_json",
        "score_components_json",
        "final_score",
        "rank",
        "display_status",
      ]),
      feedback: normalizeRows(feedback, [
        "event_id",
        "arxiv_id",
        "event_type",
        "run_id",
        "candidate_rank",
        "created_at",
      ]),
      operations: normalizeRows(operations, [
        "task_id",
        "task_type",
        "status",
        "stage",
        "completed",
        "total",
        "retry_count",
        "error_code",
        "related_run_id",
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
      ]),
      runs: normalizeRows(runs, [
        "run_id",
        "candidate_count",
        "generation_id",
        "profile_version_id",
        "weight_version_id",
        "status",
        "stage_timings_json",
        "created_at",
        "completed_at",
      ]),
    };
  }
}

function normalizeRows(
  rows: unknown,
  columns: readonly string[],
): readonly Readonly<Record<string, unknown>>[] {
  return Array.isArray(rows)
    ? rows
        .filter(
          (row): row is Readonly<Record<string, unknown>> =>
            Boolean(row) && typeof row === "object" && !Array.isArray(row),
        )
        .map((row) =>
          Object.fromEntries(
            columns.map((column) => [column, Reflect.get(row, column)]),
          ),
        )
    : [];
}

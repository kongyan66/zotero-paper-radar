import type { Migration } from "../migrationRunner.ts";

export const rankingWeightMetricsMigration: Migration = {
  version: 4,
  name: "ranking-weight-metrics",
  async up(context) {
    await context.execute(
      "ALTER TABLE ranking_weight_versions ADD COLUMN parent_version_id TEXT",
    );
    await context.execute(
      "ALTER TABLE ranking_weight_versions ADD COLUMN metrics_json TEXT NOT NULL DEFAULT '{}'",
    );
    await context.execute(
      "CREATE INDEX IF NOT EXISTS idx_ranking_weight_active ON ranking_weight_versions(is_active, created_at)",
    );
  },
};

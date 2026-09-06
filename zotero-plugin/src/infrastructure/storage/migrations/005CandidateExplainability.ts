import type { Migration } from "../migrationRunner.ts";

export const candidateExplainabilityMigration: Migration = {
  version: 5,
  name: "candidate-explainability",
  async up(context) {
    await context.execute(
      "ALTER TABLE recommendation_candidates ADD COLUMN explainability_json TEXT NOT NULL DEFAULT '{}'",
    );
  },
};

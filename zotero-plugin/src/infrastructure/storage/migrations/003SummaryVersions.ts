import type { Migration } from "../migrationRunner.ts";

export const summaryVersionsMigration: Migration = {
  version: 3,
  name: "summary-cache-versions",
  async up(context) {
    await context.execute(
      "ALTER TABLE summary_cache ADD COLUMN arxiv_version INTEGER NOT NULL DEFAULT 1",
    );
    await context.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_summary_cache_version ON summary_cache(arxiv_id, arxiv_version, llm_model, prompt_version, language)",
    );
  },
};

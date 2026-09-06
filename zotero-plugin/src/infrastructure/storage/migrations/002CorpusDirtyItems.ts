import type { Migration } from "../migrationRunner";

export const corpusDirtyItemsMigration: Migration = {
  version: 2,
  name: "corpus-dirty-items",
  async up(context) {
    await context.execute(`CREATE TABLE IF NOT EXISTS corpus_dirty_items (
      entity_type TEXT NOT NULL,
      entity_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      item_type TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_key)
    )`);
    await context.execute(
      "CREATE INDEX IF NOT EXISTS idx_corpus_dirty_items_updated ON corpus_dirty_items(updated_at)",
    );
  },
};

import type { Migration } from "../migrationRunner";
import { INITIAL_SCHEMA_STATEMENTS } from "../schema";

export const initialMigration: Migration = {
  version: 1,
  name: "initial-schema",
  async up(context) {
    for (const statement of INITIAL_SCHEMA_STATEMENTS) {
      await context.execute(statement);
    }
  },
};

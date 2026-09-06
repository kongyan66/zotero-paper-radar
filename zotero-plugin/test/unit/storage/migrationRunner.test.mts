import assert from "node:assert/strict";
import test from "node:test";
import {
  MigrationError,
  MigrationRunner,
  type Migration,
  type MigrationDatabase,
} from "../../../src/infrastructure/storage/migrationRunner.ts";

class FakeMigrationDatabase implements MigrationDatabase {
  version: number;
  feedbackEvents: string[];
  readonly executed: string[] = [];
  readonly backups: string[] = [];
  readonly restores: string[] = [];
  #backupState = new Map<
    string,
    { version: number; feedbackEvents: string[] }
  >();

  constructor(version = 0, feedbackEvents: string[] = []) {
    this.version = version;
    this.feedbackEvents = [...feedbackEvents];
  }

  async getSchemaVersion(): Promise<number> {
    return this.version;
  }

  async createBackup(suffix: string): Promise<string> {
    const path = `database.${suffix}.bak`;
    this.backups.push(path);
    this.#backupState.set(path, {
      version: this.version,
      feedbackEvents: [...this.feedbackEvents],
    });
    return path;
  }

  async restoreBackup(path: string): Promise<void> {
    const backup = this.#backupState.get(path);
    if (!backup) throw new Error("missing backup");
    this.restores.push(path);
    this.version = backup.version;
    this.feedbackEvents = [...backup.feedbackEvents];
  }

  async executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const version = this.version;
    const feedbackEvents = [...this.feedbackEvents];
    try {
      return await operation();
    } catch (error) {
      this.version = version;
      this.feedbackEvents = feedbackEvents;
      throw error;
    }
  }

  async execute(sql: string): Promise<void> {
    this.executed.push(sql);
    if (sql === "delete-feedback") this.feedbackEvents = [];
    if (sql === "fail") throw new Error("injected migration failure");
  }

  async setSchemaVersion(version: number): Promise<void> {
    this.version = version;
  }
}

const initialMigration: Migration = {
  version: 1,
  name: "initial",
  async up(database) {
    await database.execute("create-initial-schema");
  },
};

test("runs pending migrations once and skips backups for a new database", async () => {
  const database = new FakeMigrationDatabase();
  const runner = new MigrationRunner([initialMigration]);

  const first = await runner.migrate(database);
  const second = await runner.migrate(database);

  assert.deepEqual(first.appliedVersions, [1]);
  assert.deepEqual(second.appliedVersions, []);
  assert.equal(database.version, 1);
  assert.deepEqual(database.executed, ["create-initial-schema"]);
  assert.deepEqual(database.backups, []);
});

test("backs up an existing database and restores feedback after failure", async () => {
  const database = new FakeMigrationDatabase(1, ["saved-paper"]);
  const failingMigration: Migration = {
    version: 2,
    name: "failing",
    async up(context) {
      await context.execute("delete-feedback");
      await context.execute("fail");
    },
  };
  const runner = new MigrationRunner([initialMigration, failingMigration]);

  await assert.rejects(
    runner.migrate(database),
    (error: unknown) =>
      error instanceof MigrationError &&
      error.fromVersion === 1 &&
      error.targetVersion === 2 &&
      error.restoreAttempted,
  );

  assert.equal(database.version, 1);
  assert.deepEqual(database.feedbackEvents, ["saved-paper"]);
  assert.equal(database.backups.length, 1);
  assert.deepEqual(database.restores, database.backups);
});

test("rejects migration lists with gaps before touching the database", async () => {
  const database = new FakeMigrationDatabase();
  const runner = new MigrationRunner([
    initialMigration,
    { version: 3, name: "gap", async up() {} },
  ]);

  await assert.rejects(runner.migrate(database), /contiguous/i);
  assert.deepEqual(database.executed, []);
});

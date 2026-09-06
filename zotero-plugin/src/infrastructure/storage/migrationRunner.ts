export interface MigrationContext {
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

export interface MigrationDatabase extends MigrationContext {
  getSchemaVersion(): Promise<number>;
  setSchemaVersion(version: number, migrationName?: string): Promise<void>;
  createBackup(suffix: string): Promise<string | undefined>;
  restoreBackup(path: string): Promise<void>;
  executeTransaction<T>(operation: () => Promise<T>): Promise<T>;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  up(context: MigrationContext): Promise<void>;
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly appliedVersions: readonly number[];
  readonly backupPath?: string;
}

export class MigrationError extends Error {
  readonly fromVersion: number;
  readonly targetVersion: number;
  readonly restoreAttempted: boolean;
  readonly restoreError?: unknown;

  constructor(options: {
    fromVersion: number;
    targetVersion: number;
    cause: unknown;
    restoreAttempted: boolean;
    restoreError?: unknown;
  }) {
    super(
      `Migration from version ${options.fromVersion} to ${options.targetVersion} failed`,
    );
    this.name = "MigrationError";
    this.fromVersion = options.fromVersion;
    this.targetVersion = options.targetVersion;
    this.restoreAttempted = options.restoreAttempted;
    this.restoreError = options.restoreError;
    (this as Error & { cause?: unknown }).cause = options.cause;
  }
}

export class MigrationRunner {
  readonly #migrations: readonly Migration[];

  constructor(migrations: readonly Migration[]) {
    this.#migrations = [...migrations].sort(
      (left, right) => left.version - right.version,
    );
  }

  async migrate(database: MigrationDatabase): Promise<MigrationResult> {
    this.validateMigrations();
    const fromVersion = await database.getSchemaVersion();
    const latestVersion = this.#migrations.at(-1)?.version ?? 0;
    if (fromVersion > latestVersion) {
      throw new Error(
        `Database schema version ${fromVersion} is newer than supported version ${latestVersion}`,
      );
    }

    const pending = this.#migrations.filter(
      (migration) => migration.version > fromVersion,
    );
    if (pending.length === 0) {
      return {
        fromVersion,
        toVersion: fromVersion,
        appliedVersions: [],
      };
    }

    const targetVersion = pending.at(-1)!.version;
    const backupPath =
      fromVersion > 0
        ? await database.createBackup(
            `pre-migration-v${fromVersion}-to-v${targetVersion}`,
          )
        : undefined;
    const appliedVersions: number[] = [];

    try {
      for (const migration of pending) {
        await database.executeTransaction(async () => {
          await migration.up(database);
          await database.setSchemaVersion(migration.version, migration.name);
        });
        appliedVersions.push(migration.version);
      }
    } catch (cause) {
      let restoreError: unknown;
      if (backupPath) {
        try {
          await database.restoreBackup(backupPath);
        } catch (error) {
          restoreError = error;
        }
      }
      throw new MigrationError({
        fromVersion,
        targetVersion,
        cause,
        restoreAttempted: Boolean(backupPath),
        restoreError,
      });
    }

    return {
      fromVersion,
      toVersion: targetVersion,
      appliedVersions,
      backupPath,
    };
  }

  private validateMigrations(): void {
    for (let index = 0; index < this.#migrations.length; index += 1) {
      const migration = this.#migrations[index];
      const expectedVersion = index + 1;
      if (migration.version !== expectedVersion) {
        throw new Error(
          `Migration versions must be contiguous from 1; expected ${expectedVersion}, received ${migration.version}`,
        );
      }
      if (!migration.name.trim()) {
        throw new Error(`Migration ${migration.version} must have a name`);
      }
    }
  }
}

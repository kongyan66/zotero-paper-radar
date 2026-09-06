import { MigrationRunner, type MigrationDatabase } from "./migrationRunner";
import { initialMigration } from "./migrations/001Initial";
import { corpusDirtyItemsMigration } from "./migrations/002CorpusDirtyItems";
import { summaryVersionsMigration } from "./migrations/003SummaryVersions.ts";
import { rankingWeightMetricsMigration } from "./migrations/004RankingWeightMetrics.ts";
import { candidateExplainabilityMigration } from "./migrations/005CandidateExplainability.ts";
import { DATABASE_NAME } from "./schema";

type DatabaseConnection = _ZoteroTypes.DB;
type ConnectionFactory = () => DatabaseConnection;

class ZoteroMigrationDatabase implements MigrationDatabase {
  readonly #connection: DatabaseConnection;

  constructor(connection: DatabaseConnection) {
    this.#connection = connection;
  }

  async getSchemaVersion(): Promise<number> {
    if (!(await this.#connection.tableExists("schema_meta"))) return 0;
    const version = await this.#connection.valueQueryAsync<number>(
      "SELECT schema_version FROM schema_meta WHERE id = 1",
    );
    return version === false ? 0 : Number(version);
  }

  async setSchemaVersion(
    version: number,
    migrationName = "unknown",
  ): Promise<void> {
    await this.execute(
      `UPDATE schema_meta
       SET schema_version = ?,
           last_migration_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           last_migration_name = ?,
           migration_status = 'ready'
       WHERE id = 1`,
      [version, migrationName],
    );
  }

  async createBackup(suffix: string): Promise<string> {
    const created = await Promise.resolve(
      this.#connection.backupDatabase(suffix, true),
    );
    if (!created) {
      throw new Error(`Could not create migration backup for ${DATABASE_NAME}`);
    }
    return `${this.#connection.path}.${suffix}.bak`;
  }

  async restoreBackup(path: string): Promise<void> {
    const databasePath = this.#connection.path;
    const failedPath = `${databasePath}.migration-failed`;
    await this.#connection.closeDatabase(false);
    await IOUtils.remove(failedPath, { ignoreAbsent: true });
    await IOUtils.move(databasePath, failedPath, { noOverwrite: false });
    try {
      await IOUtils.copy(path, databasePath, { noOverwrite: false });
      await this.#connection.test();
      await this.execute("PRAGMA foreign_keys = ON");
      await IOUtils.remove(failedPath, { ignoreAbsent: true });
    } catch (error) {
      await IOUtils.remove(databasePath, { ignoreAbsent: true });
      await IOUtils.move(failedPath, databasePath, { noOverwrite: false });
      await this.#connection.test();
      throw error;
    }
  }

  executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
    return this.#connection.executeTransaction(operation);
  }

  async execute(sql: string, params?: readonly unknown[]): Promise<void> {
    await this.#connection.queryAsync(
      sql,
      params as _ZoteroTypes.DB.QueryParams | undefined,
    );
  }
}

export class PluginDatabase {
  readonly name = DATABASE_NAME;
  readonly #connectionFactory: ConnectionFactory;
  #connection?: DatabaseConnection;
  #openPromise?: Promise<void>;
  #path?: string;

  constructor(
    connectionFactory: ConnectionFactory = () =>
      new Zotero.DBConnection(DATABASE_NAME),
  ) {
    this.#connectionFactory = connectionFactory;
  }

  get connection(): DatabaseConnection | undefined {
    return this.#connection;
  }

  get path(): string {
    if (!this.#path) throw new Error("Plugin database has not been opened");
    return this.#path;
  }

  get isOpen(): boolean {
    return Boolean(this.#connection);
  }

  async open(): Promise<void> {
    if (this.#connection) return;
    if (this.#openPromise) return this.#openPromise;
    this.#openPromise = this.openConnection();
    try {
      await this.#openPromise;
    } finally {
      this.#openPromise = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.#openPromise) await this.#openPromise;
    const connection = this.#connection;
    if (!connection) return;
    await connection.closeDatabase(true);
    if (this.#connection === connection) this.#connection = undefined;
  }

  private async openConnection(): Promise<void> {
    const connection = this.#connectionFactory();
    this.#path = connection.path;
    try {
      await connection.test();
      await connection.queryAsync("PRAGMA foreign_keys = ON");
      const migrations = new MigrationRunner([
        initialMigration,
        corpusDirtyItemsMigration,
        summaryVersionsMigration,
        rankingWeightMetricsMigration,
        candidateExplainabilityMigration,
      ]);
      await migrations.migrate(new ZoteroMigrationDatabase(connection));
      this.#connection = connection;
    } catch (error) {
      await connection.closeDatabase(false);
      throw error;
    }
  }
}

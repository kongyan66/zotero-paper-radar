import type { PluginDatabase } from "./pluginDatabase.ts";

export interface SummaryCacheEntry {
  readonly arxivID: string;
  readonly arxivVersion: number;
  readonly model: string;
  readonly promptVersion: string;
  readonly language: string;
  readonly summary: string;
  readonly createdAt: string;
}

export class SummaryRepository {
  readonly #database: PluginDatabase;

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async get(
    input: Omit<SummaryCacheEntry, "summary" | "createdAt">,
  ): Promise<string | undefined> {
    const row = (await this.connection().rowQueryAsync(
      `SELECT summary FROM summary_cache
       WHERE arxiv_id = ? AND arxiv_version = ? AND llm_model = ?
         AND prompt_version = ? AND language = ?`,
      [
        input.arxivID,
        input.arxivVersion,
        input.model,
        input.promptVersion,
        input.language,
      ],
    )) as { summary: string } | false;
    return row ? row.summary : undefined;
  }

  async save(entry: SummaryCacheEntry): Promise<void> {
    await this.connection().queryAsync(
      `INSERT OR REPLACE INTO summary_cache (
        arxiv_id, arxiv_version, llm_model, prompt_version, language, summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.arxivID,
        entry.arxivVersion,
        entry.model,
        entry.promptVersion,
        entry.language,
        entry.summary,
        entry.createdAt,
      ],
    );
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

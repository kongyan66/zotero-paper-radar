import type {
  EmbeddingCacheEntry,
  EmbeddingStore,
} from "../../domain/embeddings/embeddingBatcher.ts";
import type { ModelFingerprint } from "../../domain/embeddings/modelFingerprint.ts";
import { decodeFloat32Vector, encodeFloat32Vector } from "./schema.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export class EmbeddingRepository implements EmbeddingStore {
  constructor(
    private readonly database: PluginDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ensureGeneration(generation: ModelFingerprint): Promise<void> {
    await this.connection().queryAsync(
      `INSERT OR IGNORE INTO embedding_generations (
        generation_id, base_url_hash, model_name, vector_dimensions,
        normalization_version, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generation.generationID,
        generation.baseURLHash,
        generation.model,
        generation.dimensions,
        generation.normalizationVersion,
        "draft",
        this.now().toISOString(),
      ],
    );
  }

  async getCached(
    generationID: string,
    objectType: string,
    objectID: string,
    contentHash: string,
  ): Promise<readonly number[] | undefined> {
    const connection = this.connection();
    const rows = (await connection.queryAsync(
      `SELECT vector FROM embedding_cache
       WHERE generation_id = ? AND object_type = ?
         AND object_id = ? AND content_hash = ?`,
      [generationID, objectType, objectID, contentHash],
    )) as
      | { vector: Uint8Array | ArrayBuffer | readonly number[] | string }[]
      | undefined;
    const blob = rows?.[0]?.vector;
    if (!blob) return undefined;
    await connection.queryAsync(
      `UPDATE embedding_cache SET last_accessed_at = ?
       WHERE generation_id = ? AND object_type = ?
         AND object_id = ? AND content_hash = ?`,
      [
        this.now().toISOString(),
        generationID,
        objectType,
        objectID,
        contentHash,
      ],
    );
    return decodeFloat32Vector(blob);
  }

  async getLatestCached(
    generationID: string,
    objectType: string,
    objectID: string,
  ): Promise<readonly number[] | undefined> {
    const rows = (await this.connection().queryAsync(
      `SELECT vector FROM embedding_cache
       WHERE generation_id = ? AND object_type = ? AND object_id = ?
       ORDER BY last_accessed_at DESC LIMIT 1`,
      [generationID, objectType, objectID],
    )) as
      | { vector: Uint8Array | ArrayBuffer | readonly number[] | string }[]
      | undefined;
    const blob = rows?.[0]?.vector;
    return blob ? decodeFloat32Vector(blob) : undefined;
  }

  async saveBatch(
    entries: readonly EmbeddingCacheEntry[],
    checkpoint: number,
  ): Promise<void> {
    const connection = this.connection();
    const timestamp = this.now().toISOString();
    await connection.executeTransaction(async () => {
      for (const entry of entries) {
        const vector = encodeFloat32Vector(entry.vector);
        await connection.queryAsync(
          `INSERT OR REPLACE INTO embedding_cache (
            object_type, object_id, content_hash, generation_id, vector,
            size_bytes, created_at, last_accessed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entry.objectType,
            entry.objectID,
            entry.contentHash,
            entry.generationID,
            vector,
            vector.byteLength,
            timestamp,
            timestamp,
          ],
        );
      }
      await connection.queryAsync(
        `UPDATE operation_tasks
         SET completed = ?, checkpoint_json = ?, updated_at = ?
         WHERE task_type = 'build-profile' AND status = 'running'`,
        [
          checkpoint,
          JSON.stringify({ embeddingCheckpoint: checkpoint }),
          timestamp,
        ],
      );
    });
  }

  async publishGeneration(generationID: string): Promise<void> {
    const connection = this.connection();
    await connection.executeTransaction(async () => {
      const generation = (await connection.rowQueryAsync(
        `SELECT base_url_hash, model_name, normalization_version
         FROM embedding_generations WHERE generation_id = ?`,
        generationID,
      )) as
        | {
            base_url_hash: string;
            model_name: string;
            normalization_version: string;
          }
        | false;
      if (!generation)
        throw new Error(`Unknown embedding generation ${generationID}`);
      await connection.queryAsync(
        `UPDATE embedding_generations SET status = 'archived'
         WHERE status = 'published' AND generation_id != ?
           AND base_url_hash = ? AND model_name = ?
           AND normalization_version = ?`,
        [
          generationID,
          generation.base_url_hash,
          generation.model_name,
          generation.normalization_version,
        ],
      );
      await connection.queryAsync(
        "UPDATE embedding_generations SET status = 'published' WHERE generation_id = ?",
        generationID,
      );
    });
  }

  async getGeneration(
    generationID: string,
  ): Promise<EmbeddingGenerationRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      `SELECT generation_id, base_url_hash, model_name, vector_dimensions,
              normalization_version, status, created_at
       FROM embedding_generations WHERE generation_id = ?`,
      generationID,
    )) as EmbeddingGenerationRow | false;
    if (!row) return undefined;
    return {
      generationID: row.generation_id,
      baseURLHash: row.base_url_hash,
      model: row.model_name,
      dimensions: row.vector_dimensions,
      normalizationVersion: row.normalization_version,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

export interface EmbeddingGenerationRecord {
  readonly generationID: string;
  readonly baseURLHash: string;
  readonly model: string;
  readonly dimensions: number;
  readonly normalizationVersion: string;
  readonly status: string;
  readonly createdAt: string;
}

interface EmbeddingGenerationRow {
  generation_id: string;
  base_url_hash: string;
  model_name: string;
  vector_dimensions: number;
  normalization_version: string;
  status: string;
  created_at: string;
}

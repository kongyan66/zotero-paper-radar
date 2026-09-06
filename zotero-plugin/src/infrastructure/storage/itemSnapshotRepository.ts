import type { PluginDatabase } from "./pluginDatabase";

export interface DirtyCorpusEntity {
  readonly entityType: "item" | "collection";
  readonly entityKey: string;
  readonly eventType: string;
  readonly itemType?: string;
  readonly updatedAt: string;
}

export class ItemSnapshotRepository {
  constructor(private readonly database: PluginDatabase) {}

  async markDirty(entities: readonly DirtyCorpusEntity[]): Promise<void> {
    if (entities.length === 0) return;
    const connection = this.requireConnection();
    await connection.executeTransaction(async () => {
      for (const entity of entities) {
        await connection.queryAsync(
          `INSERT INTO corpus_dirty_items (
            entity_type, entity_key, event_type, item_type, updated_at
          ) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(entity_type, entity_key) DO UPDATE SET
            event_type = excluded.event_type,
            item_type = COALESCE(excluded.item_type, corpus_dirty_items.item_type),
            updated_at = excluded.updated_at`,
          [
            entity.entityType,
            entity.entityKey,
            entity.eventType,
            entity.itemType ?? null,
            entity.updatedAt,
          ],
        );
      }
    });
  }

  async countDirty(): Promise<number> {
    const value = await this.requireConnection().valueQueryAsync<number>(
      "SELECT COUNT(*) FROM corpus_dirty_items",
    );
    return Number(value || 0);
  }

  async listDirty(): Promise<readonly DirtyCorpusEntity[]> {
    const rows = (await this.requireConnection().queryAsync(
      `SELECT entity_type, entity_key, event_type, item_type, updated_at
       FROM corpus_dirty_items ORDER BY updated_at, entity_type, entity_key`,
    )) as
      | {
          entity_type: "item" | "collection";
          entity_key: string;
          event_type: string;
          item_type: string | null;
          updated_at: string;
        }[]
      | undefined;
    return (rows ?? []).map((row) => ({
      entityType: row.entity_type,
      entityKey: row.entity_key,
      eventType: row.event_type,
      itemType: row.item_type ?? undefined,
      updatedAt: row.updated_at,
    }));
  }

  async clearDirty(
    entities?: readonly { entityType: string; entityKey: string }[],
  ): Promise<void> {
    const connection = this.requireConnection();
    if (!entities) {
      await connection.queryAsync("DELETE FROM corpus_dirty_items");
      return;
    }
    await connection.executeTransaction(async () => {
      for (const entity of entities) {
        await connection.queryAsync(
          "DELETE FROM corpus_dirty_items WHERE entity_type = ? AND entity_key = ?",
          [entity.entityType, entity.entityKey],
        );
      }
    });
  }

  async wasTracked(libraryID: number, itemKey: string): Promise<boolean> {
    const value = await this.requireConnection().valueQueryAsync(
      `SELECT 1 FROM item_snapshots
       WHERE library_id = ? AND item_key = ? LIMIT 1`,
      [libraryID, itemKey],
    );
    return value !== false;
  }

  private requireConnection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

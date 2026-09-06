import type { ProfileOverlay } from "../../domain/profiles/profileEditor.ts";
import { parseJsonArray } from "./schema.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export class ProfileOverlayRepository {
  constructor(
    private readonly database: PluginDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(lineageID: string): Promise<ProfileOverlay | undefined> {
    const rows = (await this.connection().queryAsync(
      `SELECT lineage_id, user_name, keywords_json, weight, locked, disabled,
              include_item_keys_json, exclude_item_keys_json,
              structure_operations_json
       FROM profile_overlays WHERE lineage_id = ?`,
      lineageID,
    )) as
      | {
          lineage_id: string;
          user_name: string | null;
          keywords_json: string;
          weight: number;
          locked: number;
          disabled: number;
          include_item_keys_json: string;
          exclude_item_keys_json: string;
          structure_operations_json: string;
        }[]
      | undefined;
    const row = rows?.[0];
    if (!row) return undefined;
    return {
      lineageId: row.lineage_id,
      userName: row.user_name ?? "",
      keywords: parseJsonArray(row.keywords_json, "keywords_json") as string[],
      weight: Number(row.weight),
      locked: Boolean(row.locked),
      disabled: Boolean(row.disabled),
      includeItemKeys: parseJsonArray(
        row.include_item_keys_json,
        "include_item_keys_json",
      ) as string[],
      excludeItemKeys: parseJsonArray(
        row.exclude_item_keys_json,
        "exclude_item_keys_json",
      ) as string[],
      structureOperations: parseJsonArray(
        row.structure_operations_json,
        "structure_operations_json",
      ) as ProfileOverlay["structureOperations"],
    };
  }

  async save(overlay: ProfileOverlay): Promise<void> {
    await this.connection().queryAsync(
      `INSERT OR REPLACE INTO profile_overlays (
        lineage_id, user_name, keywords_json, weight, locked, disabled,
        include_item_keys_json, exclude_item_keys_json,
        structure_operations_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        overlay.lineageId,
        overlay.userName || null,
        JSON.stringify(overlay.keywords),
        overlay.weight,
        overlay.locked ? 1 : 0,
        overlay.disabled ? 1 : 0,
        JSON.stringify(overlay.includeItemKeys),
        JSON.stringify(overlay.excludeItemKeys),
        JSON.stringify(overlay.structureOperations),
        this.now().toISOString(),
      ],
    );
  }

  async delete(lineageID: string): Promise<void> {
    await this.connection().queryAsync(
      "DELETE FROM profile_overlays WHERE lineage_id = ?",
      lineageID,
    );
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

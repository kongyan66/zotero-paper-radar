import { assert } from "chai";
import { config } from "../../package.json";
import {
  DATABASE_NAME,
  encodeFloat32Vector,
  CURRENT_SCHEMA_VERSION,
  INITIAL_INDEX_NAMES,
  INITIAL_TABLE_NAMES,
} from "../../src/infrastructure/storage/schema";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";

interface DatabaseTestAddon {
  data: {
    database?: PluginDatabase;
  };
}

describe("isolated plugin database", function () {
  it("uses a fixed file outside the Zotero main database", function () {
    const database = getDatabase();

    assert.equal(database.name, DATABASE_NAME);
    assert.notEqual(database.path, Zotero.DB.path);
    assert.match(database.path, /zotero-arxiv-daily\.sqlite$/);
    assert.isTrue(database.isOpen);
  });

  it("creates every initial table and required index", async function () {
    const database = getDatabase();
    const connection = database.connection;
    assert.exists(connection);

    for (const table of INITIAL_TABLE_NAMES) {
      assert.isTrue(await connection!.tableExists(table), table);
    }
    for (const index of INITIAL_INDEX_NAMES) {
      assert.isTrue(await connection!.indexExists(index), index);
    }
    assert.equal(
      await connection!.valueQueryAsync(
        "SELECT schema_version FROM schema_meta WHERE id = 1",
      ),
      CURRENT_SCHEMA_VERSION,
    );
  });

  it("opens idempotently and can close and reopen its connection", async function () {
    const database = getDatabase();
    const originalConnection = database.connection;
    await database.open();
    assert.equal(database.connection, originalConnection);

    await database.close();
    assert.isFalse(database.isOpen);
    assert.isUndefined(database.connection);

    await database.open();
    assert.isTrue(database.isOpen);
    assert.exists(database.connection);
    assert.equal(
      await database.connection!.valueQueryAsync(
        "SELECT COUNT(*) FROM schema_meta",
      ),
      1,
    );
  });

  it("persists embedding vectors as Float32 blobs", async function () {
    const connection = getDatabase().connection!;
    const generationID = "test-generation";
    const vector = encodeFloat32Vector([0.25, -1.5, 3]);

    await connection.executeTransaction(async () => {
      await connection.queryAsync(
        `INSERT OR REPLACE INTO embedding_generations (
          generation_id, base_url_hash, model_name, vector_dimensions,
          normalization_version, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generationID,
          "test-hash",
          "test-model",
          3,
          "v1",
          "test",
          "2026-08-27T00:00:00Z",
        ],
      );
      await connection.queryAsync(
        `INSERT OR REPLACE INTO embedding_cache (
          object_type, object_id, content_hash, generation_id, vector,
          size_bytes, created_at, last_accessed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "test",
          "paper",
          "content-hash",
          generationID,
          vector,
          vector.byteLength,
          "2026-08-27T00:00:00Z",
          "2026-08-27T00:00:00Z",
        ],
      );

      assert.equal(
        await connection.valueQueryAsync(
          "SELECT typeof(vector) FROM embedding_cache WHERE generation_id = ?",
          generationID,
        ),
        "blob",
      );
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT length(vector) FROM embedding_cache WHERE generation_id = ?",
          generationID,
        ),
        12,
      );
      await connection.queryAsync(
        "DELETE FROM embedding_cache WHERE generation_id = ?",
        generationID,
      );
      await connection.queryAsync(
        "DELETE FROM embedding_generations WHERE generation_id = ?",
        generationID,
      );
    });
  });
});

function getDatabase(): PluginDatabase {
  const instance = Zotero[config.addonInstance] as unknown as DatabaseTestAddon;
  assert.exists(instance.data.database);
  return instance.data.database!;
}

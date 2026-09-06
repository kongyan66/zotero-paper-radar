import { assert } from "chai";
import { config } from "../../package.json";
import { createModelFingerprint } from "../../src/domain/embeddings/modelFingerprint";
import { EmbeddingRepository } from "../../src/infrastructure/storage/embeddingRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";

interface EmbeddingRepositoryTestAddon {
  data: { database?: PluginDatabase };
}

describe("embedding repository", function () {
  it("persists normalized batches and switches model generations atomically", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as EmbeddingRepositoryTestAddon
    ).data.database!;
    const repository = new EmbeddingRepository(
      database,
      () => new Date("2026-08-27T10:00:00.000Z"),
    );
    const first = createModelFingerprint({
      baseURL: "https://test.models.example/v1",
      model: "test-embedding-repository",
      dimensions: 2,
      normalizationVersion: "l2-v1",
    });
    const second = createModelFingerprint({
      baseURL: "https://test.models.example/v1",
      model: "test-embedding-repository",
      dimensions: 3,
      normalizationVersion: "l2-v1",
    });
    const connection = database.connection!;
    let stage = "ensure first generation";
    try {
      await repository.ensureGeneration(first);
      stage = "save first batch";
      await repository.saveBatch(
        [
          {
            generationID: first.generationID,
            objectType: "test",
            objectID: "paper",
            contentHash: "hash",
            vector: [0.6, 0.8],
          },
        ],
        1,
      );
      stage = "read first cache entry";
      const cached = await repository.getCached(
        first.generationID,
        "test",
        "paper",
        "hash",
      );
      assert.exists(cached);
      assert.closeTo(cached![0], 0.6, 0.000001);
      assert.closeTo(cached![1], 0.8, 0.000001);
      stage = "publish first generation";
      await repository.publishGeneration(first.generationID);

      stage = "ensure and publish second generation";
      await repository.ensureGeneration(second);
      await repository.publishGeneration(second.generationID);
      stage = "verify generation statuses";
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT status FROM embedding_generations WHERE generation_id = ?",
          first.generationID,
        ),
        "archived",
      );
      assert.equal(
        await connection.valueQueryAsync(
          "SELECT status FROM embedding_generations WHERE generation_id = ?",
          second.generationID,
        ),
        "published",
      );
    } catch (error) {
      throw new Error(
        `${stage}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    } finally {
      await connection.queryAsync(
        "DELETE FROM embedding_cache WHERE generation_id IN (?, ?)",
        [first.generationID, second.generationID],
      );
      await connection.queryAsync(
        "DELETE FROM embedding_generations WHERE generation_id IN (?, ?)",
        [first.generationID, second.generationID],
      );
    }
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  EmbeddingBatcher,
  EmbeddingGenerationMismatchError,
  normalizeEmbedding,
  type EmbeddingCacheEntry,
  type EmbeddingStore,
} from "../../../src/domain/embeddings/embeddingBatcher.ts";
import { createModelFingerprint } from "../../../src/domain/embeddings/modelFingerprint.ts";

const generation = createModelFingerprint({
  baseURL: "https://models.example.com/v1",
  model: "embedding-test",
  dimensions: 2,
  normalizationVersion: "l2-v1",
});

const items = Array.from({ length: 5 }, (_, index) => ({
  objectType: "zotero-paper",
  objectID: `paper-${index}`,
  itemVersion: 1,
  title: `Paper ${index}`,
  abstract: `Abstract ${index}`,
}));

class MemoryEmbeddingStore implements EmbeddingStore {
  readonly entries = new Map<string, EmbeddingCacheEntry>();
  readonly checkpoints: number[] = [];
  published?: string;

  async ensureGeneration(): Promise<void> {}

  async getCached(
    generationID: string,
    objectType: string,
    objectID: string,
    contentHash: string,
  ): Promise<readonly number[] | undefined> {
    return this.entries.get(
      `${generationID}:${objectType}:${objectID}:${contentHash}`,
    )?.vector;
  }

  async saveBatch(
    entries: readonly EmbeddingCacheEntry[],
    checkpoint: number,
  ): Promise<void> {
    for (const entry of entries) {
      this.entries.set(
        `${entry.generationID}:${entry.objectType}:${entry.objectID}:${entry.contentHash}`,
        entry,
      );
    }
    this.checkpoints.push(checkpoint);
  }

  async publishGeneration(generationID: string): Promise<void> {
    this.published = generationID;
  }
}

test("identical second run makes zero embedding requests", async () => {
  const store = new MemoryEmbeddingStore();
  let calls = 0;
  const client = {
    async embedDocuments(batch: readonly unknown[]) {
      calls += 1;
      return {
        model: "embedding-test",
        dimensions: 2,
        vectors: batch.map((_, index) => [index + 1, 1]),
        latencyMs: 1,
      };
    },
  };
  const batcher = new EmbeddingBatcher({ batchSize: 2 });

  const first = await batcher.run({ items, generation, client, store });
  assert.equal(calls, 3);
  assert.equal(first.requested, 5);
  assert.equal(first.cacheHits, 0);
  assert.deepEqual(store.checkpoints, [2, 4, 5]);
  assert.equal(store.published, generation.generationID);

  calls = 0;
  const second = await batcher.run({ items, generation, client, store });
  assert.equal(calls, 0);
  assert.equal(second.requested, 0);
  assert.equal(second.cacheHits, 5);
});

test("failure on the third batch resumes from the third batch", async () => {
  const store = new MemoryEmbeddingStore();
  let calls = 0;
  let failThirdBatch = true;
  const client = {
    async embedDocuments(batch: readonly unknown[]) {
      calls += 1;
      if (calls === 3 && failThirdBatch) throw new Error("batch failed");
      return {
        model: "embedding-test",
        dimensions: 2,
        vectors: batch.map(() => [3, 4]),
        latencyMs: 1,
      };
    },
  };
  const batcher = new EmbeddingBatcher({ batchSize: 2 });

  await assert.rejects(() => batcher.run({ items, generation, client, store }));
  assert.equal(store.entries.size, 4);
  assert.deepEqual(store.checkpoints, [2, 4]);

  failThirdBatch = false;
  calls = 0;
  const result = await batcher.run({ items, generation, client, store });
  assert.equal(calls, 1);
  assert.equal(result.cacheHits, 4);
  assert.equal(result.requested, 1);
});

test("vectors are L2-normalized and zero vectors are rejected", () => {
  assert.deepEqual(normalizeEmbedding([3, 4]), [0.6, 0.8]);
  assert.throws(() => normalizeEmbedding([0, 0]), /zero vector/i);
});

test("dimension change requires a new model generation", async () => {
  const store = new MemoryEmbeddingStore();
  const batcher = new EmbeddingBatcher({ batchSize: 2 });
  await assert.rejects(
    () =>
      batcher.run({
        items: items.slice(0, 1),
        generation,
        store,
        client: {
          async embedDocuments() {
            return {
              model: "embedding-test",
              dimensions: 3,
              vectors: [[1, 0, 0]],
              latencyMs: 1,
            };
          },
        },
      }),
    (error: unknown) => error instanceof EmbeddingGenerationMismatchError,
  );
  assert.equal(store.entries.size, 0);
  assert.notEqual(
    generation.generationID,
    createModelFingerprint({
      baseURL: "https://models.example.com/v1",
      model: "embedding-test",
      dimensions: 3,
      normalizationVersion: "l2-v1",
    }).generationID,
  );
});

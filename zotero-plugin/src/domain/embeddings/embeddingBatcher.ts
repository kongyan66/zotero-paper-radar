import type { EmbeddingBatchResult } from "../../infrastructure/models/openAIEmbeddingClient.ts";
import {
  createEmbeddingContentHash,
  type ModelFingerprint,
} from "./modelFingerprint.ts";

export interface EmbeddingWorkItem {
  readonly objectType: string;
  readonly objectID: string;
  readonly itemVersion: number;
  readonly title: string;
  readonly abstract: string;
}

export interface EmbeddingCacheEntry {
  readonly generationID: string;
  readonly objectType: string;
  readonly objectID: string;
  readonly contentHash: string;
  readonly vector: readonly number[];
}

export interface EmbeddingStore {
  ensureGeneration(generation: ModelFingerprint): Promise<void>;
  getCached(
    generationID: string,
    objectType: string,
    objectID: string,
    contentHash: string,
  ): Promise<readonly number[] | undefined>;
  saveBatch(
    entries: readonly EmbeddingCacheEntry[],
    checkpoint: number,
  ): Promise<void>;
  publishGeneration(generationID: string): Promise<void>;
}

export interface EmbeddingClient {
  embedDocuments(
    documents: readonly { title: string; abstract: string }[],
    signal?: AbortSignal,
  ): Promise<EmbeddingBatchResult>;
}

export interface EmbeddingProgress {
  readonly total: number;
  readonly completed: number;
  readonly cacheHits: number;
  readonly requested: number;
  readonly failed: number;
  readonly cancelled: boolean;
}

export interface EmbeddingRunResult extends EmbeddingProgress {
  readonly vectors: ReadonlyMap<string, readonly number[]>;
}

interface EmbeddingBatcherOptions {
  readonly batchSize: number;
  readonly onProgress?: (progress: EmbeddingProgress) => void;
}

export class EmbeddingGenerationMismatchError extends Error {
  public readonly expectedDimensions: number;
  public readonly actualDimensions: number;

  constructor(expectedDimensions: number, actualDimensions: number) {
    super(
      `Embedding dimensions changed from ${expectedDimensions} to ${actualDimensions}; create a new generation`,
    );
    this.name = "EmbeddingGenerationMismatchError";
    this.expectedDimensions = expectedDimensions;
    this.actualDimensions = actualDimensions;
  }
}

export class EmbeddingBatcher {
  private readonly batchSize: number;
  private readonly onProgress?: (progress: EmbeddingProgress) => void;

  constructor(options: EmbeddingBatcherOptions) {
    this.batchSize = Math.max(1, Math.round(options.batchSize));
    this.onProgress = options.onProgress;
  }

  async run(input: {
    items: readonly EmbeddingWorkItem[];
    generation: ModelFingerprint;
    client: EmbeddingClient;
    store: EmbeddingStore;
    signal?: AbortSignal;
  }): Promise<EmbeddingRunResult> {
    await input.store.ensureGeneration(input.generation);
    const vectors = new Map<string, readonly number[]>();
    const misses: {
      item: EmbeddingWorkItem;
      contentHash: string;
      index: number;
    }[] = [];
    let cacheHits = 0;
    let requested = 0;
    let failed = 0;

    for (let index = 0; index < input.items.length; index += 1) {
      throwIfAborted(input.signal);
      const item = input.items[index];
      const contentHash = createEmbeddingContentHash(item);
      const cached = await input.store.getCached(
        input.generation.generationID,
        item.objectType,
        item.objectID,
        contentHash,
      );
      if (cached) {
        vectors.set(item.objectID, cached);
        cacheHits += 1;
      } else {
        misses.push({ item, contentHash, index });
      }
    }
    this.report(
      input.items.length,
      vectors.size,
      cacheHits,
      requested,
      failed,
      false,
    );

    try {
      for (let start = 0; start < misses.length; start += this.batchSize) {
        throwIfAborted(input.signal);
        const batch = misses.slice(start, start + this.batchSize);
        let response: EmbeddingBatchResult;
        try {
          response = await input.client.embedDocuments(
            batch.map(({ item }) => ({
              title: item.title,
              abstract: item.abstract,
            })),
            input.signal,
          );
        } catch (error) {
          failed += batch.length;
          this.report(
            input.items.length,
            vectors.size,
            cacheHits,
            requested,
            failed,
            input.signal?.aborted ?? false,
          );
          throw error;
        }
        if (response.dimensions !== input.generation.dimensions) {
          throw new EmbeddingGenerationMismatchError(
            input.generation.dimensions,
            response.dimensions,
          );
        }
        if (response.vectors.length !== batch.length) {
          throw new Error("Embedding response count does not match batch size");
        }
        const entries = batch.map(
          (work, index): EmbeddingCacheEntry => ({
            generationID: input.generation.generationID,
            objectType: work.item.objectType,
            objectID: work.item.objectID,
            contentHash: work.contentHash,
            vector: normalizeEmbedding(response.vectors[index]),
          }),
        );
        const checkpoint = batch.at(-1)!.index + 1;
        await input.store.saveBatch(entries, checkpoint);
        for (const entry of entries) vectors.set(entry.objectID, entry.vector);
        requested += batch.length;
        this.report(
          input.items.length,
          vectors.size,
          cacheHits,
          requested,
          failed,
          false,
        );
      }
      await input.store.publishGeneration(input.generation.generationID);
    } catch (error) {
      if (input.signal?.aborted) {
        this.report(
          input.items.length,
          vectors.size,
          cacheHits,
          requested,
          failed,
          true,
        );
      }
      throw error;
    }

    return {
      total: input.items.length,
      completed: vectors.size,
      cacheHits,
      requested,
      failed,
      cancelled: false,
      vectors,
    };
  }

  private report(
    total: number,
    completed: number,
    cacheHits: number,
    requested: number,
    failed: number,
    cancelled: boolean,
  ): void {
    this.onProgress?.({
      total,
      completed,
      cacheHits,
      requested,
      failed,
      cancelled,
    });
  }
}

export function normalizeEmbedding(vector: readonly number[]): number[] {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding vector must contain finite values");
  }
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Embedding zero vector cannot be normalized");
  }
  return vector.map((value) => value / magnitude);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

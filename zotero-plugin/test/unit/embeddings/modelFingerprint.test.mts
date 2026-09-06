import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmbeddingContentHash,
  createModelFingerprint,
} from "../../../src/domain/embeddings/modelFingerprint.ts";

test("model fingerprint normalizes base URL without including an API key", () => {
  const first = createModelFingerprint({
    baseURL: "HTTPS://MODELS.EXAMPLE.COM/v1/",
    model: " text-embedding-test ",
    dimensions: 3,
    normalizationVersion: "l2-v1",
  });
  const second = createModelFingerprint({
    baseURL: "https://models.example.com/v1",
    model: "text-embedding-test",
    dimensions: 3,
    normalizationVersion: "l2-v1",
  });

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first).includes("apiKey"), false);
});

test("model, dimensions, normalization, item version, and content invalidate cache", () => {
  const base = {
    baseURL: "https://models.example.com/v1",
    model: "embedding-a",
    dimensions: 3,
    normalizationVersion: "l2-v1",
  };
  const fingerprints = [
    createModelFingerprint(base).generationID,
    createModelFingerprint({ ...base, model: "embedding-b" }).generationID,
    createModelFingerprint({ ...base, dimensions: 4 }).generationID,
    createModelFingerprint({
      ...base,
      normalizationVersion: "l2-v2",
    }).generationID,
  ];
  assert.equal(new Set(fingerprints).size, 4);

  const contentHashes = [
    createEmbeddingContentHash({ itemVersion: 1, title: "A", abstract: "B" }),
    createEmbeddingContentHash({ itemVersion: 2, title: "A", abstract: "B" }),
    createEmbeddingContentHash({ itemVersion: 1, title: "A2", abstract: "B" }),
    createEmbeddingContentHash({ itemVersion: 1, title: "A", abstract: "B2" }),
  ];
  assert.equal(new Set(contentHashes).size, 4);

  const ark = createModelFingerprint({
    ...base,
    provider: "volcengine-ark",
  });
  assert.equal(ark.provider, "volcengine-ark");
  assert.notEqual(ark.generationID, createModelFingerprint(base).generationID);
});

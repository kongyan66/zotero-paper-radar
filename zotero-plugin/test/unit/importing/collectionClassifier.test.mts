import assert from "node:assert/strict";
import test from "node:test";
import { suggestCollection } from "../../../src/domain/importing/collectionClassifier.ts";

test("representatives receive double weight and clear majority gets a suggestion", () => {
  const result = suggestCollection([
    { collectionKey: "cv", similarity: 0.8, isRepresentative: true },
    { collectionKey: "cv", similarity: 0.7 },
    { collectionKey: "llm", similarity: 0.3 },
  ]);
  assert.equal(result.status, "suggested");
  assert.equal(result.collectionKey, "cv");
  assert.equal(result.confidence > 0.55, true);
});

test("ambiguous votes remain pending classification", () => {
  const result = suggestCollection([
    { collectionKey: "cv", similarity: 0.8 },
    { collectionKey: "llm", similarity: 0.75 },
  ]);
  assert.equal(result.status, "待分类");
  assert.equal(result.collectionKey, undefined);
});

test("old user corrections decay with a 180-day half-life", () => {
  const now = new Date("2026-08-27T00:00:00Z");
  const recent = suggestCollection(
    [
      {
        collectionKey: "a",
        similarity: 1,
        userCorrection: true,
        occurredAt: "2026-08-27T00:00:00Z",
      },
      { collectionKey: "b", similarity: 0.7 },
    ],
    now,
  );
  const old = suggestCollection(
    [
      {
        collectionKey: "a",
        similarity: 1,
        userCorrection: true,
        occurredAt: "2026-02-28T00:00:00Z",
      },
      { collectionKey: "b", similarity: 0.7 },
    ],
    now,
  );
  assert.ok(recent.confidence > old.confidence);
});

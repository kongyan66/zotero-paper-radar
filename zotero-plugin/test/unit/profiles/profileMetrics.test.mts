import assert from "node:assert/strict";
import test from "node:test";
import { computeProfileMetrics } from "../../../src/domain/profiles/profileMetrics.ts";

test("profile quality metrics are recomputed from members", () => {
  const metrics = computeProfileMetrics({
    centroid: [1, 0],
    members: [
      { id: "a", vector: [1, 0], collectionKeys: ["DOCS"] },
      { id: "b", vector: [0.8, 0.2], collectionKeys: ["DOCS"] },
      { id: "c", vector: [0.9, 0.1], collectionKeys: ["OTHER"] },
    ],
    previousMemberIDs: ["a", "b", "old"],
  });

  assert.equal(metrics.memberCount, 3);
  assert.ok(metrics.meanIntraclusterSimilarity > 0.97);
  assert.equal(metrics.versionOverlap, 0.5);
  assert.equal(metrics.primaryCollectionKey, "DOCS");
  assert.equal(metrics.primaryCollectionShare, 2 / 3);
});

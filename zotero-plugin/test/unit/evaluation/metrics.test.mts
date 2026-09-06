import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReplayMetrics,
  meanReciprocalRank,
  ndcgAtK,
  recallAtK,
} from "../../../src/evaluation/metrics.ts";
import type { ReplayPaper } from "../../../src/evaluation/types.ts";

const features = {
  recentSimilarity: 0,
  longTermSimilarity: 0,
  representativeSimilarity: 0,
  keywordMatch: 0,
  manualPriority: 0,
  negativeSimilarity: 0,
} as const;

test("计算固定排序的 Recall、MRR、nDCG、画像覆盖和列表内相似度", () => {
  const ranked = ["a", "b", "c"];
  const relevant = new Set(["b", "c"]);
  const papers = new Map<string, ReplayPaper>([
    ["a", paper("a", ["p1"], [1, 0])],
    ["b", paper("b", ["p2"], [0, 1])],
    ["c", paper("c", ["p2"], [1, 0])],
  ]);

  assert.equal(recallAtK(ranked, relevant, 5), 1);
  assert.equal(meanReciprocalRank(ranked, relevant), 0.5);
  const expectedNdcg =
    (1 / Math.log2(3) + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3));
  assert.ok(Math.abs(ndcgAtK(ranked, relevant, 5) - expectedNdcg) < 1e-12);

  const metrics = calculateReplayMetrics(ranked, [...relevant], papers);
  assert.equal(metrics.profileCoverage, 1);
  assert.ok(Math.abs(metrics.intraListSimilarity - 1 / 3) < 1e-12);
  assert.ok(Math.abs(metrics.singleProfileShare - 2 / 3) < 1e-12);
});

function paper(
  paperID: string,
  profileIDs: readonly string[],
  vector: readonly number[],
): ReplayPaper {
  return {
    paperID,
    publishedAt: "2026-01-02T00:00:00.000Z",
    profileIDs,
    vector,
    features,
  };
}

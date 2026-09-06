import assert from "node:assert/strict";
import test from "node:test";
import {
  lineageSimilarity,
  matchProfileLineages,
} from "../../../src/domain/profiles/profileLineage.ts";

test("lineage score is exactly 0.7 Jaccard plus 0.3 cosine with 0.60 threshold", () => {
  const score = lineageSimilarity(
    { memberIDs: ["a", "b", "c"], centroid: [1, 0] },
    { memberIDs: ["b", "c", "d"], centroid: [1, 0] },
  );
  assert.equal(score, 0.7 * 0.5 + 0.3 * 1);

  const matches = matchProfileLineages(
    [
      {
        profileID: "old",
        lineageID: "lineage-doc",
        profileType: "long-term",
        memberIDs: ["a", "b", "c"],
        centroid: [1, 0],
      },
    ],
    [
      {
        profileID: "new",
        profileType: "long-term",
        memberIDs: ["b", "c", "d"],
        centroid: [1, 0],
      },
    ],
  );
  assert.equal(matches[0].lineageID, "lineage-doc");
  assert.equal(matches[0].matched, true);
  assert.equal(matches[0].threshold, 0.6);
});

test("lineage matching is one-to-one, type-safe, and keeps locked user names", () => {
  const matches = matchProfileLineages(
    [
      {
        profileID: "old-doc",
        lineageID: "lineage-doc",
        profileType: "long-term",
        memberIDs: ["a", "b"],
        centroid: [1, 0],
        lockedUserName: "我的文档智能",
      },
      {
        profileID: "old-recent",
        lineageID: "lineage-recent",
        profileType: "recent",
        memberIDs: ["a", "b"],
        centroid: [1, 0],
      },
    ],
    [
      {
        profileID: "new-best",
        profileType: "long-term",
        memberIDs: ["a", "b"],
        centroid: [1, 0],
      },
      {
        profileID: "new-second",
        profileType: "long-term",
        memberIDs: ["a"],
        centroid: [1, 0],
      },
    ],
  );

  const best = matches.find((match) => match.profileID === "new-best")!;
  const second = matches.find((match) => match.profileID === "new-second")!;
  assert.equal(best.lineageID, "lineage-doc");
  assert.equal(best.lockedUserName, "我的文档智能");
  assert.equal(second.matched, false);
  assert.notEqual(second.lineageID, "lineage-doc");
});

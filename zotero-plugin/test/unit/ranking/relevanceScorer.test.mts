import assert from "node:assert/strict";
import test from "node:test";
import { scoreCandidate } from "../../../src/domain/ranking/relevanceScorer.ts";
import type {
  ArxivCandidate,
  InterestProfile,
} from "../../../src/domain/model.ts";

const candidate: ArxivCandidate = {
  arxivId: "2608.00001",
  version: 1,
  title: "Vision transformer",
  abstract: "Document OCR",
  authors: [],
  categories: ["cs.CV"],
  submittedAt: "2026-08-26T00:00:00Z",
  abstractUrl: "https://arxiv.org/abs/2608.00001",
  pdfUrl: "https://arxiv.org/pdf/2608.00001.pdf",
};
const profile: InterestProfile = {
  id: "p1",
  lineageId: "l1",
  versionId: "v1",
  horizon: "recent",
  name: "Vision",
  keywords: ["vision"],
  centroid: [1, 0],
  representativeItemKeys: [],
  memberCount: 3,
  weight: 2,
  locked: false,
  disabled: false,
};

test("raw score is the weighted sum of independently visible features", () => {
  const result = scoreCandidate(
    { candidate, vector: [1, 0] },
    {
      recentProfiles: [profile],
      longTermProfiles: [],
      negativeSignals: [{ vector: [1, 0], occurredAt: "2026-08-27T00:00:00Z" }],
      now: new Date("2026-08-27T00:00:00Z"),
    },
  );
  assert.equal(result.matchedProfileID, "p1");
  assert.equal(result.score.recentSimilarity, 1);
  assert.equal(result.score.manualPriority, 1);
  assert.equal(result.score.negativeSimilarity, 1);
  assert.equal(result.score.rawScore, 0.35 + 0.1 + 0.1 - 0.25);
  assert.equal(result.score.rerankedScore, result.score.rawScore);
});

test("selected profile IDs limit all feature profile matches", () => {
  const selected = scoreCandidate(
    { candidate, vector: [1, 0] },
    {
      recentProfiles: [profile],
      longTermProfiles: [],
      selectedProfileIDs: ["different"],
    },
  );
  assert.equal(selected.score.recentSimilarity, 0);
  assert.equal(selected.matchedProfileID, undefined);
});

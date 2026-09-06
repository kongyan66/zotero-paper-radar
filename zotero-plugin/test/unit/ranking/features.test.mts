import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RANKING_WEIGHTS } from "../../../src/domain/ranking/defaultWeights.ts";
import { extractCandidateFeatures } from "../../../src/domain/ranking/features.ts";
import type {
  ArxivCandidate,
  InterestProfile,
} from "../../../src/domain/model.ts";

const candidate: ArxivCandidate = {
  arxivId: "2608.00001",
  version: 1,
  title: "Vision transformer for document OCR",
  abstract: "A method for document parsing.",
  authors: [],
  categories: ["cs.CV"],
  submittedAt: "2026-08-26T00:00:00Z",
  abstractUrl: "https://arxiv.org/abs/2608.00001",
  pdfUrl: "https://arxiv.org/pdf/2608.00001.pdf",
};

const profile: InterestProfile = {
  id: "profile-1",
  lineageId: "lineage-1",
  versionId: "version-1",
  horizon: "long-term",
  name: "Document AI / OCR",
  keywords: ["document", "OCR"],
  centroid: [1, 0],
  representativeItemKeys: ["item-1"],
  memberCount: 10,
  weight: 1,
  locked: false,
  disabled: false,
};

test("default ranking weights are the planned explainable six features", () => {
  assert.deepEqual(DEFAULT_RANKING_WEIGHTS, {
    recentSimilarity: 0.35,
    longTermSimilarity: 0.25,
    representativeSimilarity: 0.2,
    keywordMatch: 0.1,
    manualPriority: 0.1,
    negativeSimilarity: -0.25,
  });
});

test("features expose best profile, top three representatives, and keyword hits", () => {
  const result = extractCandidateFeatures(
    { candidate, vector: [1, 0] },
    {
      recentProfiles: [],
      longTermProfiles: [profile],
      representatives: {
        "profile-1": [
          { itemKey: "item-1", title: "OCR", vector: [1, 0] },
          { itemKey: "item-2", title: "Other", vector: [0, 1] },
        ],
      },
      now: new Date("2026-08-27T00:00:00Z"),
    },
  );
  assert.equal(result.longTermSimilarity, 1);
  assert.equal(result.representativeSimilarity, 0.5);
  assert.deepEqual(result.matchedKeywords, ["document", "OCR"]);
  assert.equal(result.representativeMatches[0].itemKey, "item-1");
});

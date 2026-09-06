import assert from "node:assert/strict";
import test from "node:test";
import { diversityRerank } from "../../../src/domain/ranking/diversityReranker.ts";
import type { RerankCandidate } from "../../../src/domain/ranking/diversityReranker.ts";
import type {
  ArxivCandidate,
  ScoreBreakdown,
} from "../../../src/domain/model.ts";

function makeCandidate(
  index: number,
  profileID: string,
  rawScore: number,
  vector: number[],
): RerankCandidate {
  const candidate: ArxivCandidate = {
    arxivId: `2608.${String(index).padStart(5, "0")}`,
    version: 1,
    title: `Paper ${index}`,
    abstract: "Abstract",
    authors: [],
    categories: ["cs.CV"],
    submittedAt: `2026-08-${String(20 + (index % 7)).padStart(2, "0")}T00:00:00Z`,
    abstractUrl: `https://arxiv.org/abs/2608.${String(index).padStart(5, "0")}`,
    pdfUrl: `https://arxiv.org/pdf/2608.${String(index).padStart(5, "0")}.pdf`,
  };
  const score: ScoreBreakdown = {
    recentSimilarity: 0,
    longTermSimilarity: 0,
    representativeSimilarity: 0,
    keywordMatch: 0,
    manualPriority: 0,
    negativeSimilarity: 0,
    rawScore,
    diversityAdjustment: 0,
    rerankedScore: rawScore,
    displayScore: 0,
  };
  return {
    candidate,
    vector,
    features: {} as RerankCandidate["features"],
    score,
    matchedProfileID: profileID,
    matchedProfileName: profileID,
  };
}

test("applies raw minus 0.12 times maximum selected similarity", () => {
  const result = diversityRerank([
    makeCandidate(1, "p1", 1, [1, 0]),
    makeCandidate(2, "p2", 0.9, [0, 1]),
    makeCandidate(3, "p1", 0.8, [1, 0]),
  ]);
  assert.equal(result[0].candidate.arxivId, "2608.00001");
  assert.equal(result[1].candidate.arxivId, "2608.00002");
  assert.equal(result[2].score.diversityAdjustment, -0.12);
  assert.equal(result[2].score.rerankedScore, 0.68);
});

test("limits a profile to sixty percent once at least five results are shown", () => {
  const candidates = [
    makeCandidate(1, "p1", 1, [1, 0]),
    makeCandidate(2, "p1", 0.99, [1, 0]),
    makeCandidate(3, "p1", 0.98, [1, 0]),
    makeCandidate(4, "p1", 0.97, [1, 0]),
    makeCandidate(5, "p1", 0.96, [1, 0]),
    makeCandidate(6, "p2", 0.9, [0, 1]),
    makeCandidate(7, "p2", 0.89, [0, 1]),
  ];
  const result = diversityRerank(candidates, { limit: 5 });
  assert.ok(
    result.filter((candidate) => candidate.matchedProfileID === "p1").length <=
      3,
  );
});

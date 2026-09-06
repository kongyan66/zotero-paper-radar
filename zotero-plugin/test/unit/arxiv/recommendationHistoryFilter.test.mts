import assert from "node:assert/strict";
import test from "node:test";
import { filterUnseenCandidates } from "../../../src/domain/recommendations/recommendationHistory.ts";
import type { ArxivCandidate } from "../../../src/domain/model.ts";

function paper(arxivId: string): ArxivCandidate {
  return {
    arxivId,
    version: 1,
    title: arxivId,
    abstract: "Abstract",
    authors: [],
    categories: ["cs.CV"],
    submittedAt: "2026-09-04T00:00:00Z",
    abstractUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
  };
}

test("filters papers already shown during the recommendation window", () => {
  const result = filterUnseenCandidates(
    [paper("2609.00001"), paper("2609.00002"), paper("2609.00003")],
    new Set(["2609.00002"]),
  );

  assert.deepEqual(
    result.map((candidate) => candidate.arxivId),
    ["2609.00001", "2609.00003"],
  );
});

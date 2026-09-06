import assert from "node:assert/strict";
import test from "node:test";
import { prefilterCandidates } from "../../../src/domain/candidates/candidatePrefilter.ts";
import type { ArxivCandidate } from "../../../src/domain/model.ts";

const candidates: ArxivCandidate[] = Array.from(
  { length: 1200 },
  (_, index) => ({
    arxivId: `2608.${String(index).padStart(5, "0")}`,
    version: 1,
    title:
      index < 900
        ? `Vision transformer paper ${index}`
        : `Unrelated topic ${index}`,
    abstract:
      index < 900
        ? "A paper about vision transformers and image recognition."
        : "A paper about another topic.",
    authors: [],
    categories: ["cs.CV"],
    submittedAt: "2026-08-26T00:00:00Z",
    abstractUrl: `https://arxiv.org/abs/2608.${String(index).padStart(5, "0")}`,
    pdfUrl: `https://arxiv.org/pdf/2608.${String(index).padStart(5, "0")}.pdf`,
  }),
);

test("does not trim at or below one thousand candidates", () => {
  const result = prefilterCandidates(candidates.slice(0, 1000));
  assert.equal(result.candidates.length, 1000);
  assert.equal(result.usedLexicalPrefilter, false);
});

test("keeps BM25 top 800 plus a deterministic 200-paper exploration sample", () => {
  const first = prefilterCandidates(candidates, {
    userKeywords: ["vision transformer"],
    seed: "fixed",
  });
  const second = prefilterCandidates(candidates, {
    userKeywords: ["vision transformer"],
    seed: "fixed",
  });
  assert.equal(first.candidates.length, 1000);
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.arxivId),
    second.candidates.map((candidate) => candidate.arxivId),
  );
  assert.equal(
    Object.values(first.selectedBy).filter((value) => value === "exploration")
      .length,
    200,
  );
  assert.ok(
    first.candidates.some((candidate) =>
      candidate.title.startsWith("Unrelated"),
    ),
  );
});

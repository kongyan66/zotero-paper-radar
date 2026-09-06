import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateCandidates,
  filterSuppressedCandidates,
} from "../../../src/domain/candidates/duplicateFilter.ts";
import type { ArxivCandidate } from "../../../src/domain/model.ts";

function paper(overrides: Partial<ArxivCandidate> = {}): ArxivCandidate {
  return {
    arxivId: "2608.00001",
    version: 1,
    title: "A Useful Paper",
    abstract: "Abstract",
    authors: ["Author"],
    categories: ["cs.CV"],
    submittedAt: "2026-08-26T00:00:00Z",
    abstractUrl: "https://arxiv.org/abs/2608.00001",
    pdfUrl: "https://arxiv.org/pdf/2608.00001v1.pdf",
    ...overrides,
  };
}

test("deduplicates in arXiv ID, DOI, URL, then title-year order", () => {
  const result = deduplicateCandidates([
    paper({ arxivId: "2608.00001", version: 1 }),
    paper({ arxivId: "2608.00001", version: 2 }),
    paper({
      arxivId: "2608.00002",
      doi: "10.1234/ABC",
      title: "Second Paper",
      abstractUrl: "https://arxiv.org/abs/2608.00002",
      pdfUrl: "https://arxiv.org/pdf/2608.00002.pdf",
    }),
    paper({
      arxivId: "2608.00003",
      doi: "https://doi.org/10.1234/abc",
      title: "Second Paper",
      abstractUrl: "https://arxiv.org/abs/2608.00003",
      pdfUrl: "https://arxiv.org/pdf/2608.00003.pdf",
    }),
    paper({
      arxivId: "2608.00004",
      abstractUrl: "https://arxiv.org/abs/2608.00001",
    }),
    paper({
      arxivId: "2608.00005",
      abstractUrl: "https://arxiv.org/abs/2608.00005",
      pdfUrl: "https://arxiv.org/pdf/2608.00005.pdf",
    }),
  ]);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.duplicates.length, 4);
  assert.equal(result.duplicates[0].kind, "arxiv-id");
  assert.ok(result.duplicates.some((duplicate) => duplicate.kind === "doi"));
  assert.ok(result.duplicates.some((duplicate) => duplicate.kind === "url"));
});

test("saved and rejected are permanent, deferred expires after seven days", () => {
  const now = new Date("2026-08-27T00:00:00Z");
  const candidates = [
    paper(),
    paper({ arxivId: "2608.00002" }),
    paper({ arxivId: "2608.00003" }),
    paper({ arxivId: "2608.00004" }),
  ];
  const result = filterSuppressedCandidates(
    candidates,
    [
      {
        arxivId: "2608.00001",
        kind: "saved",
        occurredAt: "2020-01-01T00:00:00Z",
      },
      {
        arxivId: "2608.00002",
        kind: "rejected-topic",
        occurredAt: "2020-01-01T00:00:00Z",
      },
      {
        arxivId: "2608.00003",
        kind: "deferred",
        occurredAt: "2026-08-19T00:00:00Z",
      },
      {
        arxivId: "2608.00004",
        kind: "deferred",
        occurredAt: "2026-08-10T00:00:00Z",
      },
    ],
    now,
  );
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.arxivId),
    ["2608.00003", "2608.00004"],
  );
  assert.deepEqual(result.suppressed, ["2608.00001", "2608.00002"]);
});

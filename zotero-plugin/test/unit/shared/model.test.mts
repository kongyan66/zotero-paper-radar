import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  arxivCandidate,
  feedbackEvent,
  interestProfiles,
  scoreBreakdown,
  zoteroPapers,
} from "../../fixtures/papers.ts";
import { topicVectors } from "../../fixtures/vectors.ts";

test("domain fixtures cover three distinct research interests", () => {
  assert.equal(zoteroPapers.length, 3);
  assert.deepEqual(
    interestProfiles.map((profile) => profile.name),
    [
      "Document AI / PDF Parsing / OCR",
      "Depth Estimation / 3D Vision",
      "Long-tail Recognition / Noisy Labels",
    ],
  );
  assert.equal(new Set(Object.values(topicVectors).map(String)).size, 3);
});

test("recommendation and feedback fixtures expose explainable identifiers", () => {
  assert.match(arxivCandidate.arxivId, /^\d{4}\.\d{4,5}$/);
  assert.equal(scoreBreakdown.displayScore, 91);
  assert.equal(feedbackEvent.idempotencyKey, "run-1:2608.12345:saved");
});

test("the domain model does not depend on Zotero globals", async () => {
  const source = await readFile(
    new URL("../../../src/domain/model.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bZotero\b/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeArxivIdentity,
  normalizeBibliographicTitle,
  normalizeBibliographicURL,
  normalizeDoiIdentity,
  titleYearIdentity,
} from "../../../src/domain/importing/bibliographicNormalization.ts";

test("normalizes arXiv versions, DOI URLs, URLs, and titles", () => {
  assert.equal(
    normalizeArxivIdentity("https://arxiv.org/pdf/2608.24845v2.pdf"),
    "2608.24845",
  );
  assert.equal(
    normalizeArxivIdentity("arXiv:hep-th/9901001v3"),
    "hep-th/9901001",
  );
  assert.equal(
    normalizeDoiIdentity("https://doi.org/10.48550/arXiv.2608.24845."),
    "10.48550/arxiv.2608.24845",
  );
  assert.equal(
    normalizeBibliographicURL(
      "http://www.example.com/paper?utm_source=x#section",
    ),
    "https://example.com/paper",
  );
  assert.equal(
    normalizeBibliographicTitle("A Study: On Models v2"),
    "a study on models",
  );
});

test("title-year does not merge different publication years", () => {
  assert.equal(titleYearIdentity("A Paper", "2026-01-01"), "a paper:2026");
  assert.notEqual(
    titleYearIdentity("A Paper", "2025-01-01"),
    titleYearIdentity("A Paper", "2026-01-01"),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { detectDuplicate } from "../../../src/infrastructure/zotero/duplicateDetector.ts";

const base = {
  title: "A Paper",
  date: "2026-01-01",
  arxivID: "2608.24845",
  doi: "10.1234/paper",
  url: "https://arxiv.org/abs/2608.24845",
};

test("uses strong identifiers in fixed priority order", () => {
  const result = detectDuplicate(base, [{ itemKey: "A", ...base }]);
  assert.deepEqual(result, {
    status: "match",
    match: { itemKey: "A", kind: "arxiv-id" },
  });
  const doi = detectDuplicate({ ...base, arxivID: undefined }, [
    { itemKey: "B", ...base },
  ]);
  assert.deepEqual(doi, {
    status: "match",
    match: { itemKey: "B", kind: "doi" },
  });
});

test("multiple weak matches are returned for confirmation rather than selected", () => {
  const result = detectDuplicate(
    { ...base, arxivID: undefined, doi: undefined, url: undefined },
    [
      { itemKey: "A", title: "A Paper", date: "2026-01-01" },
      { itemKey: "B", title: "A Paper", date: "2026-01-01" },
    ],
  );
  assert.equal(result.status, "conflict");
  if (result.status === "conflict")
    assert.deepEqual(
      result.matches.map((match) => match.itemKey),
      ["A", "B"],
    );
});

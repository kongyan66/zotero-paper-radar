import assert from "node:assert/strict";
import test from "node:test";
import { nameProfile } from "../../../src/domain/profiles/profileNaming.ts";
import { zoteroPapers } from "../../fixtures/papers.ts";

test("generic words cannot dominate a profile name", () => {
  const result = nameProfile(
    [
      {
        paper: {
          ...zoteroPapers[0],
          title: "Performance Study of Document Collections",
          abstract:
            "Performance on collections for PDF parsing, layout analysis and OCR.",
          tags: ["collections", "performance", "document parsing", "OCR"],
        },
        vector: [1, 0, 0],
      },
    ],
    [1, 0, 0],
  );

  assert.equal(result.systemName, "Document AI / PDF Parsing / OCR");
  assert.equal(result.keywords.includes("performance"), false);
  assert.equal(result.keywords.includes("collections"), false);
});

test("fixed fixtures produce readable domain names and representatives", () => {
  const cases = [
    {
      paper: zoteroPapers[0],
      vector: [1, 0, 0],
      expected: "Document AI / PDF Parsing / OCR",
    },
    {
      paper: zoteroPapers[1],
      vector: [0, 1, 0],
      expected: "Depth Estimation / 3D Vision",
    },
    {
      paper: zoteroPapers[2],
      vector: [0, 0, 1],
      expected: "Long-tail Recognition / Noisy Labels",
    },
  ];

  for (const value of cases) {
    const result = nameProfile(
      [{ paper: value.paper, vector: value.vector }],
      value.vector,
    );
    assert.equal(result.systemName, value.expected);
    assert.deepEqual(result.representativeItemKeys, [value.paper.itemKey]);
    assert.ok(result.keywords.length >= 2);
  }
});

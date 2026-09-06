import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeArxivId,
  parseArxivAtom,
} from "../../../src/infrastructure/arxiv/atomParser.ts";

const FEED = `<?xml version="1.0"?><feed xmlns:opensearch="http://a">
<opensearch:totalResults>1</opensearch:totalResults><opensearch:startIndex>0</opensearch:startIndex><opensearch:itemsPerPage>1</opensearch:itemsPerPage>
<entry><id>http://arxiv.org/abs/2608.24845v2</id><updated>2026-08-26T08:00:00Z</updated><published>2026-08-25T08:00:00Z</published><title> A &amp; Better Paper </title><summary><![CDATA[We solve a problem.]]></summary><author><name>Ada Lovelace</name></author><category term="cs.CV"/><arxiv:doi xmlns:arxiv="http://arxiv.org/schemas/atom">10.48550/arXiv.2608.24845</arxiv:doi><link rel="alternate" href="https://arxiv.org/abs/2608.24845"/><link title="pdf" type="application/pdf" href="https://arxiv.org/pdf/2608.24845v2"/></entry></feed>`;

test("parses normal Atom entries, metadata, and current version", () => {
  const feed = parseArxivAtom(FEED);
  assert.equal(feed.totalResults, 1);
  assert.deepEqual(feed.candidates[0], {
    arxivId: "2608.24845",
    version: 2,
    title: "A & Better Paper",
    abstract: "We solve a problem.",
    authors: ["Ada Lovelace"],
    categories: ["cs.CV"],
    submittedAt: "2026-08-25T08:00:00.000Z",
    updatedAt: "2026-08-26T08:00:00.000Z",
    doi: "10.48550/arXiv.2608.24845",
    abstractUrl: "https://arxiv.org/abs/2608.24845",
    pdfUrl: "https://arxiv.org/pdf/2608.24845v2",
  });
});

test("skips incomplete entries and normalizes modern and legacy IDs", () => {
  assert.deepEqual(
    parseArxivAtom("<feed><entry><id>x</id></entry></feed>").candidates,
    [],
  );
  assert.deepEqual(
    normalizeArxivId("https://arxiv.org/pdf/hep-th/9901001v3.pdf"),
    {
      baseId: "hep-th/9901001",
      rawId: "hep-th/9901001v3",
    },
  );
  assert.equal(normalizeArxivId("not-an-arxiv-id"), undefined);
});

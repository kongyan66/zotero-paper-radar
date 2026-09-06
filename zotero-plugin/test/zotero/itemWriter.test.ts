import { assert } from "chai";
import { ZoteroItemWriter } from "../../src/infrastructure/zotero/itemWriter";

describe("item writer", function () {
  it("maps validated arXiv metadata directly to a preprint item", async function () {
    const fields = new Map<string, string>();
    let saved = 0;
    const item = {
      key: "ITEM1",
      libraryID: 1,
      setField: (field: string, value: string) => fields.set(field, value),
      setCreators: (creators: readonly unknown[]) => {
        fields.set("creators", String(creators.length));
      },
      saveTx: async () => {
        saved += 1;
      },
    } as never;
    const writer = new ZoteroItemWriter({
      findByKey: () => undefined,
      create: () => item,
    });
    const result = await writer.write(
      {
        arxivId: "2608.24845",
        version: 2,
        title: "Title",
        abstract: "Abstract",
        authors: ["Ada Lovelace"],
        categories: ["cs.CV"],
        submittedAt: "2026-08-26T00:00:00Z",
        abstractUrl: "https://arxiv.org/abs/2608.24845",
        pdfUrl: "https://arxiv.org/pdf/2608.24845v2.pdf",
      },
      1,
    );
    assert.equal(result.created, true);
    assert.equal(fields.get("archiveID"), "2608.24845v2");
    assert.equal(fields.get("creators"), "1");
    assert.equal(saved, 1);
  });
});

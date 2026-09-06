import { assert } from "chai";
import { PdfAttacher } from "../../src/infrastructure/zotero/pdfAttacher";
import { HttpTransport } from "../../src/infrastructure/network/httpTransport";

const candidate = {
  arxivId: "2608.24845",
  version: 2,
  title: "Document AI",
  abstract: "Abstract",
  authors: ["Ada Lovelace"],
  categories: ["cs.CV"],
  submittedAt: "2026-08-26T00:00:00Z",
  abstractUrl: "https://arxiv.org/abs/2608.24845",
  pdfUrl: "https://arxiv.org/pdf/2608.24845v2.pdf",
};

describe("PDF attachment writer", function () {
  it("reuses a matching child attachment without downloading", async function () {
    let fetches = 0;
    const existing = { key: "PDF1" } as never;
    const attacher = new PdfAttacher({
      transport: new HttpTransport({
        maxAttempts: 1,
        fetch: async () => {
          fetches += 1;
          return new Response("unused");
        },
      }),
      runtime: {
        listChildAttachments: async () => [
          { item: existing, fileName: "2608.24845v1.pdf" },
        ],
        writeTemporary: async () => undefined,
        removeTemporary: async () => undefined,
        importFromFile: async () => ({ key: "NEW" }) as never,
      },
    });
    const result = await attacher.attach({
      candidate,
      parentItemID: 1,
      libraryID: 1,
    });
    assert.equal(result.created, false);
    assert.equal(result.attachment, existing);
    assert.equal(fetches, 0);
  });

  it("validates bytes before importing a stored child attachment", async function () {
    let imported = 0;
    let removed = 0;
    const attacher = new PdfAttacher({
      transport: new HttpTransport({
        maxAttempts: 1,
        fetch: async () =>
          new Response(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), {
            status: 200,
            headers: { "content-type": "application/pdf" },
          }),
      }),
      runtime: {
        listChildAttachments: async () => [],
        writeTemporary: async (_path, bytes) =>
          assert.equal(bytes.byteLength, 6),
        removeTemporary: async () => {
          removed += 1;
        },
        importFromFile: async () => {
          imported += 1;
          return { key: "PDF2" } as never;
        },
      },
    });
    const result = await attacher.attach({
      candidate,
      parentItemID: 1,
      libraryID: 1,
    });
    assert.equal(result.created, true);
    assert.equal(imported, 1);
    assert.equal(removed, 1);
  });
});

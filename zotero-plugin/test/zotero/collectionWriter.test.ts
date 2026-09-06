import { assert } from "chai";
import { CollectionWriter } from "../../src/infrastructure/zotero/collectionWriter";

describe("collection writer", function () {
  it("reuses an existing collection and never creates a duplicate", async function () {
    let creates = 0;
    const added: number[] = [];
    const writer = new CollectionWriter({
      list: () => [{ id: 1, key: "CV", name: "Computer Vision" }],
      create: async () => {
        creates += 1;
        return { id: 2, key: "new", name: "new" };
      },
      addItem: async (_key, collectionID) => {
        added.push(collectionID);
      },
    });
    const result = await writer.addItemToCollection(
      "ITEM1",
      1,
      "Computer Vision",
    );
    assert.equal(result.created, false);
    assert.equal(creates, 0);
    assert.deepEqual(added, [1]);
  });
});

import { assert } from "chai";
import { CorpusReader } from "../../src/infrastructure/zotero/corpusReader";

describe("Zotero corpus reader", function () {
  const itemIDs: number[] = [];
  const collectionIDs: number[] = [];

  afterEach(async function () {
    if (itemIDs.length) await Zotero.Items.erase(itemIDs.splice(0));
    if (collectionIDs.length) {
      await Zotero.Collections.erase(collectionIDs.splice(0));
    }
  });

  it("reads eligible personal-library fields and excludes a collection subtree", async function () {
    const root = new Zotero.Collection();
    root.libraryID = Zotero.Libraries.userLibraryID;
    root.name = "Exclude from recommendations";
    collectionIDs.push(await root.saveTx());

    const child = new Zotero.Collection();
    child.libraryID = Zotero.Libraries.userLibraryID;
    child.name = "Private topic";
    child.parentKey = root.key;
    collectionIDs.push(await child.saveTx());

    const included = await createPaper(
      "journalArticle",
      "Included",
      "Useful abstract",
    );
    const excluded = await createPaper(
      "preprint",
      "Excluded",
      "Private abstract",
    );
    excluded.setCollections([child.id]);
    await excluded.saveTx();
    const book = new Zotero.Item("book");
    book.libraryID = Zotero.Libraries.userLibraryID;
    book.setField("title", "Not a paper");
    book.setField("abstractNote", "Should not be read");
    itemIDs.push(await book.saveTx());

    const result = await new CorpusReader({
      excludedCollectionKeys: [root.key],
    }).read();

    assert.include(
      result.papers.map((paper) => paper.itemKey),
      included.key,
    );
    assert.notInclude(
      result.papers.map((paper) => paper.itemKey),
      excluded.key,
    );
    assert.notInclude(
      result.papers.map((paper) => paper.itemKey),
      book.key,
    );
    const paper = result.papers.find(
      (candidate) => candidate.itemKey === included.key,
    )!;
    assert.deepEqual(Object.keys(paper).sort(), [
      "abstract",
      "collectionKeys",
      "dateAdded",
      "itemKey",
      "itemType",
      "itemVersion",
      "libraryId",
      "publicationDate",
      "tags",
      "title",
    ]);
    assert.match(result.fingerprint, /^[a-f0-9]{16}$/);
  });

  async function createPaper(
    itemType: "journalArticle" | "preprint",
    title: string,
    abstract: string,
  ): Promise<Zotero.Item> {
    const item = new Zotero.Item(itemType);
    item.libraryID = Zotero.Libraries.userLibraryID;
    item.setField("title", title);
    item.setField("abstractNote", abstract);
    itemIDs.push(await item.saveTx());
    return item;
  }
});

import { assert } from "chai";
import { config } from "../../package.json";
import { ItemSnapshotRepository } from "../../src/infrastructure/storage/itemSnapshotRepository";
import type { PluginDatabase } from "../../src/infrastructure/storage/pluginDatabase";
import { CorpusNotifier } from "../../src/infrastructure/zotero/corpusNotifier";

interface NotifierTestAddon {
  data: { database?: PluginDatabase };
}

describe("Zotero corpus notifier", function () {
  const itemIDs: number[] = [];
  const collectionIDs: number[] = [];

  afterEach(async function () {
    if (itemIDs.length) await Zotero.Items.erase(itemIDs.splice(0));
    if (collectionIDs.length) {
      await Zotero.Collections.erase(collectionIDs.splice(0));
    }
  });

  it("coalesces relevant changes without requesting a model and stops after destroy", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as NotifierTestAddon
    ).data.database!;
    const repository = new ItemSnapshotRepository(database);
    await repository.clearDirty();

    const paper = new Zotero.Item("journalArticle");
    paper.libraryID = Zotero.Libraries.userLibraryID;
    paper.setField("title", "Changed paper");
    paper.setField("abstractNote", "Changed abstract");
    itemIDs.push(await paper.saveTx());
    const book = new Zotero.Item("book");
    book.libraryID = Zotero.Libraries.userLibraryID;
    book.setField("title", "Unrelated book");
    itemIDs.push(await book.saveTx());
    await repository.clearDirty();

    const originalRequest = Zotero.HTTP.request;
    let networkCalls = 0;
    Zotero.HTTP.request = (async () => {
      networkCalls += 1;
      throw new Error("unexpected model request");
    }) as typeof Zotero.HTTP.request;
    const notifier = new CorpusNotifier({
      repository,
      now: () => new Date("2026-08-27T09:00:00.000Z"),
    });
    notifier.register();
    try {
      await notifier.notify("modify", "item", [paper.id], {});
      await notifier.notify("modify", "item", [paper.id], {});
      await notifier.notify("modify", "item", [book.id], {});
      assert.equal(await repository.countDirty(), 1);
      assert.equal((await repository.listDirty())[0].entityKey, paper.key);
      assert.equal(networkCalls, 0);

      notifier.destroy();
      await notifier.notify("delete", "item", [paper.id], {
        [paper.id]: {
          key: paper.key,
          itemType: "journalArticle",
          libraryID: paper.libraryID,
        },
      });
      assert.equal(await repository.countDirty(), 1);
    } finally {
      notifier.destroy();
      Zotero.HTTP.request = originalRequest;
      await repository.clearDirty();
    }
  });

  it("marks collection changes and merges repeated keys", async function () {
    const database = (
      Zotero[config.addonInstance] as unknown as NotifierTestAddon
    ).data.database!;
    const repository = new ItemSnapshotRepository(database);
    await repository.clearDirty();
    const collection = new Zotero.Collection();
    collection.libraryID = Zotero.Libraries.userLibraryID;
    collection.name = "Changed collection";
    collectionIDs.push(await collection.saveTx());
    await repository.clearDirty();

    const notifier = new CorpusNotifier({ repository });
    notifier.register();
    try {
      await notifier.notify("modify", "collection", [collection.id], {});
      await notifier.notify("move", "collection", [collection.id], {});
      assert.equal(await repository.countDirty(), 1);
      const [dirty] = await repository.listDirty();
      assert.equal(dirty.entityType, "collection");
      assert.equal(dirty.entityKey, collection.key);
      assert.equal(dirty.eventType, "move");
    } finally {
      notifier.destroy();
      await repository.clearDirty();
    }
  });
});

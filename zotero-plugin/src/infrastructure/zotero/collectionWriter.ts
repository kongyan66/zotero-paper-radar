export interface CollectionWriterRuntime {
  list(libraryID: number): readonly {
    readonly id: number;
    readonly key: string;
    readonly name: string;
  }[];
  create(
    libraryID: number,
    name: string,
  ): Promise<{
    readonly id: number;
    readonly key: string;
    readonly name: string;
  }>;
  addItem(
    itemKey: string,
    collectionID: number,
    libraryID: number,
  ): Promise<void>;
}

export interface CollectionWriteResult {
  readonly collectionKey: string;
  readonly collectionID: number;
  readonly created: boolean;
}

export class CollectionWriter {
  readonly #runtime: CollectionWriterRuntime;

  constructor(runtime: CollectionWriterRuntime = zoteroRuntime()) {
    this.#runtime = runtime;
  }

  async ensureCollection(
    libraryID: number,
    name: string,
  ): Promise<CollectionWriteResult> {
    const normalized = name.trim();
    if (!normalized) throw new Error("收藏夹名称不能为空");
    const existing = this.#runtime
      .list(libraryID)
      .find(
        (collection) =>
          collection.key === normalized || collection.name === normalized,
      );
    if (existing)
      return {
        collectionKey: existing.key,
        collectionID: existing.id,
        created: false,
      };
    const created = await this.#runtime.create(libraryID, normalized);
    return {
      collectionKey: created.key,
      collectionID: created.id,
      created: true,
    };
  }

  async addItemToCollection(
    itemKey: string,
    libraryID: number,
    name: string,
  ): Promise<CollectionWriteResult> {
    const result = await this.ensureCollection(libraryID, name);
    await this.#runtime.addItem(itemKey, result.collectionID, libraryID);
    return result;
  }
}

function zoteroRuntime(): CollectionWriterRuntime {
  return {
    list: (libraryID) =>
      Zotero.Collections.getByLibrary(libraryID).map((collection) => ({
        id: collection.id,
        key: collection.key,
        name: collection.name,
      })),
    create: async (libraryID, name) => {
      const collection = new Zotero.Collection({ name, libraryID });
      await collection.saveTx();
      return { id: collection.id, key: collection.key, name: collection.name };
    },
    addItem: async (itemKey, collectionID, libraryID) => {
      const item = Zotero.Items.getByLibraryAndKey(libraryID, itemKey);
      if (!item) throw new Error(`找不到 Zotero 条目 ${itemKey}`);
      if (!item.getCollections().includes(collectionID)) {
        item.addToCollection(collectionID);
        await item.saveTx();
      }
    },
  };
}

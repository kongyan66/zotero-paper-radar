import {
  buildCorpusSnapshot,
  type CorpusSnapshot,
  type RawCorpusItem,
} from "../../domain/profiles/corpusPolicy.ts";
import {
  expandExcludedCollectionKeys,
  type CollectionNode,
} from "./collectionTree.ts";

interface CorpusReaderOptions {
  readonly excludedCollectionKeys?: readonly string[];
  readonly libraryID?: number;
}

export class CorpusReader {
  private readonly excludedCollectionKeys: readonly string[];
  private readonly libraryID: number;

  constructor(options: CorpusReaderOptions = {}) {
    this.excludedCollectionKeys = options.excludedCollectionKeys ?? [];
    this.libraryID = options.libraryID ?? Zotero.Libraries.userLibraryID;
  }

  async read(): Promise<CorpusSnapshot> {
    const collections = Zotero.Collections.getByLibrary(this.libraryID, true);
    const nodes: CollectionNode[] = collections.map((collection) => ({
      key: collection.key,
      name: collection.name,
      parentKey: collection.parentKey,
    }));
    const excluded = expandExcludedCollectionKeys(
      nodes,
      this.excludedCollectionKeys,
    );
    const collectionKeyByID = new Map(
      collections.map((collection) => [collection.id, collection.key]),
    );
    const items = await Zotero.Items.getAll(this.libraryID, true, false);
    return buildCorpusSnapshot(
      items.map((item) => toRawCorpusItem(item, collectionKeyByID)),
      excluded,
    );
  }
}

function toRawCorpusItem(
  item: Zotero.Item,
  collectionKeyByID: ReadonlyMap<number, string>,
): RawCorpusItem {
  return {
    libraryId: item.libraryID,
    itemKey: item.key,
    itemVersion: item.version,
    itemType: Zotero.ItemTypes.getName(item.itemTypeID),
    title: String(item.getField("title", false, true) || ""),
    abstract: String(item.getField("abstractNote", false, true) || ""),
    dateAdded: item.dateAdded,
    publicationDate: String(item.getField("date", false, true) || ""),
    collectionKeys: item
      .getCollections()
      .map((id) => collectionKeyByID.get(id))
      .filter((key): key is string => Boolean(key)),
    tags: item.getTags().map(({ tag }) => tag),
  };
}

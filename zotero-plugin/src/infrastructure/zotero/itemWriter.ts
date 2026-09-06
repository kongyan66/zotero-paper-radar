import type { ArxivCandidate } from "../../domain/model.ts";

export interface ItemWriterRuntime {
  findByKey(libraryID: number, itemKey: string): Zotero.Item | undefined;
  create(libraryID: number, type: string): Zotero.Item;
}

export interface WrittenItem {
  readonly itemKey: string;
  readonly libraryID: number;
  readonly item: Zotero.Item;
  readonly created: boolean;
}

export class ZoteroItemWriter {
  readonly #runtime: ItemWriterRuntime;

  constructor(runtime: ItemWriterRuntime = zoteroRuntime()) {
    this.#runtime = runtime;
  }

  async write(
    candidate: ArxivCandidate,
    libraryID = Zotero.Libraries.userLibraryID,
    existingItemKey?: string,
  ): Promise<WrittenItem> {
    const existing = existingItemKey
      ? this.#runtime.findByKey(libraryID, existingItemKey)
      : undefined;
    if (existing)
      return {
        itemKey: existing.key,
        libraryID,
        item: existing,
        created: false,
      };
    const item = this.#runtime.create(libraryID, "preprint");
    item.setField("title", candidate.title);
    item.setField("abstractNote", candidate.abstract);
    item.setField("date", candidate.submittedAt.slice(0, 10));
    item.setField("url", candidate.abstractUrl);
    item.setField("archive", "arXiv");
    item.setField("archiveID", `${candidate.arxivId}v${candidate.version}`);
    if (candidate.doi) item.setField("DOI", candidate.doi);
    item.setCreators(candidate.authors.map(parseCreator));
    await item.saveTx();
    return { itemKey: item.key, libraryID, item, created: true };
  }
}

function zoteroRuntime(): ItemWriterRuntime {
  return {
    findByKey: (libraryID, itemKey) =>
      Zotero.Items.getByLibraryAndKey(libraryID, itemKey) || undefined,
    create: (libraryID, type) => {
      const item = new Zotero.Item(type as "preprint");
      item.libraryID = libraryID;
      return item;
    },
  };
}

function parseCreator(value: string): _ZoteroTypes.Item.CreatorJSON {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2)
    return {
      creatorType: "author",
      lastName: parts[0],
      firstName: parts.slice(1).join(", "),
    };
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2
    ? {
        creatorType: "author",
        firstName: words.slice(0, -1).join(" "),
        lastName: words.at(-1)!,
      }
    : { creatorType: "author", name: value.trim() };
}

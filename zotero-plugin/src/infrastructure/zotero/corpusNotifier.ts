import { config } from "../../../package.json";
import type { ItemSnapshotRepository } from "../storage/itemSnapshotRepository";

interface CorpusNotifierOptions {
  readonly repository: ItemSnapshotRepository;
  readonly now?: () => Date;
}

const ELIGIBLE_ITEM_TYPES = new Set([
  "journalArticle",
  "conferencePaper",
  "preprint",
]);

export class CorpusNotifier {
  private observerID?: string;
  private active = false;
  private readonly now: () => Date;

  constructor(private readonly options: CorpusNotifierOptions) {
    this.now = options.now ?? (() => new Date());
  }

  register(): void {
    if (this.observerID) return;
    this.active = true;
    this.observerID = Zotero.Notifier.registerObserver(
      {
        notify: (event, type, ids, extraData) =>
          this.notify(event, type, ids, extraData),
      },
      ["item", "collection"],
      `${config.addonRef}-corpus`,
    );
  }

  destroy(): void {
    this.active = false;
    if (this.observerID) Zotero.Notifier.unregisterObserver(this.observerID);
    this.observerID = undefined;
  }

  async notify(
    event: _ZoteroTypes.Notifier.Event,
    type: _ZoteroTypes.Notifier.Type,
    ids: string[] | number[],
    extraData: Record<string, Record<string, unknown>> = {},
  ): Promise<void> {
    if (
      !this.active ||
      !["add", "modify", "delete", "trash", "move"].includes(event)
    ) {
      return;
    }
    const updatedAt = this.now().toISOString();
    if (type === "collection") {
      const collections = ids
        .map((id) => Zotero.Collections.get(Number(id)))
        .filter((collection): collection is Zotero.Collection =>
          Boolean(collection),
        );
      await this.options.repository.markDirty(
        ids.map((id) => ({
          entityType: "collection" as const,
          entityKey:
            collections.find((collection) => collection.id === Number(id))
              ?.key ?? String(id),
          eventType: event,
          updatedAt,
        })),
      );
      return;
    }
    if (type !== "item") return;

    if (event === "delete" || event === "trash") {
      const dirty = [];
      for (const id of ids) {
        const data = extraData[String(id)] ?? {};
        const itemType = normalizeItemType(data.itemType ?? data.itemTypeID);
        const itemKey = String(data.key ?? id);
        const libraryID = Number(
          data.libraryID ?? Zotero.Libraries.userLibraryID,
        );
        if (
          (itemType && ELIGIBLE_ITEM_TYPES.has(itemType)) ||
          (await this.options.repository.wasTracked(libraryID, itemKey))
        ) {
          dirty.push({
            entityType: "item" as const,
            entityKey: itemKey,
            eventType: event,
            itemType,
            updatedAt,
          });
        }
      }
      await this.options.repository.markDirty(dirty);
      return;
    }

    const numericIDs = ids.map(Number).filter(Number.isFinite);
    const items = numericIDs.length
      ? await Zotero.Items.getAsync(numericIDs)
      : [];
    await this.options.repository.markDirty(
      items
        .filter((item) =>
          ELIGIBLE_ITEM_TYPES.has(Zotero.ItemTypes.getName(item.itemTypeID)),
        )
        .map((item) => ({
          entityType: "item" as const,
          entityKey: item.key,
          eventType: event,
          itemType: Zotero.ItemTypes.getName(item.itemTypeID),
          updatedAt,
        })),
    );
  }
}

function normalizeItemType(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Zotero.ItemTypes.getName(value);
  return undefined;
}

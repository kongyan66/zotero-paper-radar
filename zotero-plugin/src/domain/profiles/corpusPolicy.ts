import type { ZoteroPaper, ZoteroPaperType } from "../model.ts";
import { stableJsonHash } from "../../shared/stableHash.ts";

export interface RawCorpusItem {
  readonly libraryId: number;
  readonly itemKey: string;
  readonly itemVersion: number;
  readonly itemType: string;
  readonly title: string;
  readonly abstract: string;
  readonly dateAdded: string;
  readonly publicationDate?: string;
  readonly collectionKeys: readonly string[];
  readonly tags: readonly string[];
}

export interface CorpusSnapshot {
  readonly papers: readonly ZoteroPaper[];
  readonly fingerprint: string;
}

const ELIGIBLE_TYPES = new Set<ZoteroPaperType>([
  "journalArticle",
  "conferencePaper",
  "preprint",
]);

export function isEligibleCorpusItem(
  item: RawCorpusItem,
  excludedCollectionKeys: ReadonlySet<string>,
): item is RawCorpusItem & { itemType: ZoteroPaperType } {
  return (
    ELIGIBLE_TYPES.has(item.itemType as ZoteroPaperType) &&
    normalizeText(item.title).length > 0 &&
    normalizeText(item.abstract).length > 0 &&
    !item.collectionKeys.some((key) => excludedCollectionKeys.has(key))
  );
}

export function buildCorpusSnapshot(
  items: readonly RawCorpusItem[],
  excludedCollectionKeys: ReadonlySet<string>,
): CorpusSnapshot {
  const papers = items
    .filter((item) => isEligibleCorpusItem(item, excludedCollectionKeys))
    .map((item): ZoteroPaper => normalizePaper(item))
    .sort(comparePapers);
  const fingerprint = stableJsonHash(
    papers.map((paper) => [
      paper.libraryId,
      paper.itemKey,
      paper.itemVersion,
      paper.title,
      paper.abstract,
      paper.collectionKeys,
      paper.tags,
    ]),
  );
  return { papers, fingerprint };
}

function normalizePaper(
  item: RawCorpusItem & { itemType: ZoteroPaperType },
): ZoteroPaper {
  return {
    libraryId: item.libraryId,
    itemKey: item.itemKey,
    itemVersion: item.itemVersion,
    itemType: item.itemType,
    title: normalizeText(item.title),
    abstract: normalizeText(item.abstract),
    dateAdded: item.dateAdded,
    publicationDate: item.publicationDate?.trim() ?? "",
    collectionKeys: sortedUnique(item.collectionKeys),
    tags: sortedUnique(item.tags.map(normalizeText).filter(Boolean)),
  };
}

function comparePapers(left: ZoteroPaper, right: ZoteroPaper): number {
  return (
    left.libraryId - right.libraryId ||
    left.itemKey.localeCompare(right.itemKey)
  );
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

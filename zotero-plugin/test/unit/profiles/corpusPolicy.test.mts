import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCorpusSnapshot,
  type RawCorpusItem,
} from "../../../src/domain/profiles/corpusPolicy.ts";
import {
  buildCollectionPathMap,
  expandExcludedCollectionKeys,
} from "../../../src/infrastructure/zotero/collectionTree.ts";

const baseItem: RawCorpusItem = {
  libraryId: 1,
  itemKey: "ITEM0001",
  itemVersion: 1,
  itemType: "journalArticle",
  title: "Document understanding",
  abstract: "Layout-aware OCR and document parsing.",
  dateAdded: "2026-08-01T00:00:00Z",
  publicationDate: "2026-07-30",
  collectionKeys: ["KEEP"],
  tags: ["OCR"],
};

test("corpus accepts only supported papers with non-empty title and abstract", () => {
  const items: RawCorpusItem[] = [
    baseItem,
    { ...baseItem, itemKey: "CONFERENCE", itemType: "conferencePaper" },
    { ...baseItem, itemKey: "PREPRINT", itemType: "preprint" },
    { ...baseItem, itemKey: "BOOK", itemType: "book" },
    { ...baseItem, itemKey: "NO_TITLE", title: "  " },
    { ...baseItem, itemKey: "NO_ABSTRACT", abstract: "" },
  ];

  const snapshot = buildCorpusSnapshot(items, new Set());

  assert.deepEqual(
    snapshot.papers.map((paper) => paper.itemKey),
    ["CONFERENCE", "ITEM0001", "PREPRINT"],
  );
});

test("excluded collection includes descendants and wins over retained collections", () => {
  const collections = [
    { key: "KEEP", name: "Research" },
    { key: "EXCLUDE", name: "Exclude" },
    { key: "CHILD", name: "Child", parentKey: "EXCLUDE" },
    { key: "GRANDCHILD", name: "Grandchild", parentKey: "CHILD" },
  ];
  const excluded = expandExcludedCollectionKeys(collections, ["EXCLUDE"]);
  const snapshot = buildCorpusSnapshot(
    [
      baseItem,
      { ...baseItem, itemKey: "CHILD_ITEM", collectionKeys: ["CHILD"] },
      {
        ...baseItem,
        itemKey: "BOTH",
        collectionKeys: ["KEEP", "GRANDCHILD"],
      },
    ],
    excluded,
  );

  assert.deepEqual(
    snapshot.papers.map((paper) => paper.itemKey),
    ["ITEM0001"],
  );
  assert.deepEqual([...excluded].sort(), ["CHILD", "EXCLUDE", "GRANDCHILD"]);
  assert.deepEqual(buildCollectionPathMap(collections).get("GRANDCHILD"), [
    "Exclude",
    "Child",
    "Grandchild",
  ]);
});

test("one hundred items have stable sorting, allowed fields, and fingerprint", () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    ...baseItem,
    itemKey: `KEY${String(99 - index).padStart(5, "0")}`,
    itemVersion: index + 1,
  }));
  const first = buildCorpusSnapshot(items, new Set());
  const second = buildCorpusSnapshot([...items].reverse(), new Set());

  assert.deepEqual(first, second);
  assert.equal(first.papers.length, 100);
  assert.deepEqual(Object.keys(first.papers[0]).sort(), [
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
  assert.match(first.fingerprint, /^[a-f0-9]{16}$/);
});

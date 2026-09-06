import assert from "node:assert/strict";
import test from "node:test";
import { ImportService } from "../../../src/application/importService.ts";
import type { FeedbackEventDraft } from "../../../src/domain/feedback/feedbackPolicy.ts";
import type { ImportTaskRecord } from "../../../src/infrastructure/storage/importTaskRepository.ts";
import type { FeedbackEventRecord } from "../../../src/infrastructure/storage/feedbackRepository.ts";
import type { WrittenItem } from "../../../src/infrastructure/zotero/itemWriter.ts";
import type { ArxivCandidate } from "../../../src/domain/model.ts";

const candidate: ArxivCandidate = {
  arxivId: "2608.24845",
  version: 2,
  title: "Document AI",
  abstract: "An abstract",
  authors: ["Ada Lovelace"],
  categories: ["cs.CV"],
  submittedAt: "2026-08-26T00:00:00Z",
  abstractUrl: "https://arxiv.org/abs/2608.24845",
  pdfUrl: "https://arxiv.org/pdf/2608.24845v2.pdf",
};

test("saving the same arXiv intent is idempotent across retries", async () => {
  let task: ImportTaskRecord | undefined;
  let creates = 0;
  let detects = 0;
  let writes = 0;
  let feedbacks = 0;
  const transitions: string[] = [];
  const writtenItem = {
    itemKey: "ITEM1",
    libraryID: 1,
    item: {},
    created: true,
  } as WrittenItem;
  const tasks = {
    getByIntent: async () => task,
    create: async (input: {
      taskID: string;
      stableIntentKey: string;
      arxivID: string;
    }) => {
      creates += 1;
      task = record(input);
      return task;
    },
    update: async (taskID: string, patch: Partial<ImportTaskRecord>) => {
      assert.equal(taskID, task?.taskID);
      transitions.push(patch.coreStatus ?? "metadata");
      task = { ...task!, ...patch, updatedAt: "2026-08-27T00:00:00Z" };
      return task;
    },
  };
  const items = {
    write: async () => {
      writes += 1;
      return writtenItem;
    },
  };
  const feedback = {
    record: async (draft: FeedbackEventDraft) => {
      void draft;
      feedbacks += 1;
      return { eventID: "event-1", inserted: true } as FeedbackEventRecord;
    },
  };
  const service = new ImportService({
    tasks,
    items,
    feedback,
    detect: async () => {
      detects += 1;
      return { status: "none" };
    },
  });

  const first = await service.save({
    candidate,
    runID: "run-1",
    score: 0.9,
    rank: 1,
  });
  const second = await service.save({
    candidate: { ...candidate, version: 3 },
    runID: "run-2",
  });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.taskID, first.taskID);
  assert.equal(creates, 1);
  assert.equal(detects, 1);
  assert.equal(writes, 1);
  assert.equal(feedbacks, 1);
  assert.deepEqual(transitions, [
    "checking-duplicate",
    "writing-metadata",
    "classifying",
    "recording-feedback",
    "completed",
  ]);
});

test("records the actual collection key returned by collection classification", async () => {
  let task: ImportTaskRecord | undefined;
  let recorded: FeedbackEventDraft | undefined;
  let receivedCollection:
    | { readonly key?: string; readonly name?: string }
    | undefined;
  const writtenItem = {
    itemKey: "ITEM2",
    libraryID: 1,
    item: {},
    created: true,
  } as WrittenItem;
  const service = new ImportService({
    tasks: {
      getByIntent: async () => task,
      create: async (input) => {
        task = record(input);
        return task;
      },
      update: async (_taskID, patch) => {
        task = { ...task!, ...patch, updatedAt: "2026-08-27T00:00:00Z" };
        return task;
      },
    },
    items: { write: async () => writtenItem },
    feedback: {
      record: async (draft) => {
        recorded = draft;
        return { ...draft, inserted: true } as FeedbackEventRecord;
      },
    },
    detect: async () => ({ status: "none" }),
    addCollection: async (_item, collection) => {
      receivedCollection = collection;
      return "ACTUAL_COLLECTION_KEY";
    },
  });

  await service.save({
    candidate: { ...candidate, arxivId: "2608.24846" },
    runID: "run-collection",
    targetCollectionName: "Computer Vision",
  });

  assert.deepEqual(receivedCollection, { name: "Computer Vision" });
  assert.equal(recorded?.targetCollectionKey, "ACTUAL_COLLECTION_KEY");
  assert.equal(task?.targetCollectionKey, "ACTUAL_COLLECTION_KEY");
});

function record(input: {
  taskID: string;
  stableIntentKey: string;
  arxivID: string;
}): ImportTaskRecord {
  return {
    ...input,
    coreStatus: "queued",
    attachmentStatus: "not-requested",
    createdAt: "2026-08-27T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
  };
}

import { createFeedbackDraft } from "../domain/feedback/feedbackPolicy.ts";
import type { ArxivCandidate } from "../domain/model.ts";
import type { DuplicateDetectionResult } from "../infrastructure/zotero/duplicateDetector.ts";
import {
  stableImportIntentKey,
  transitionImportState,
  type ImportCoreStatus,
} from "../domain/importing/importStateMachine.ts";
import type { FeedbackRepository as StoredFeedbackRepository } from "../infrastructure/storage/feedbackRepository.ts";
import type { ImportTaskRepository } from "../infrastructure/storage/importTaskRepository.ts";
import type {
  ZoteroItemWriter,
  WrittenItem,
} from "../infrastructure/zotero/itemWriter.ts";

export interface ImportServiceDependencies {
  readonly tasks: ImportTaskRepository;
  readonly items: ZoteroItemWriter;
  readonly feedback: StoredFeedbackRepository;
  readonly detect: (
    candidate: ArxivCandidate,
  ) => Promise<DuplicateDetectionResult>;
  readonly addCollection?: (
    item: WrittenItem,
    collection: {
      readonly key?: string;
      readonly name?: string;
    },
  ) => Promise<string | void>;
}

export interface ImportResult {
  readonly taskID: string;
  readonly itemKey: string;
  readonly created: boolean;
  readonly duplicate?: DuplicateDetectionResult;
}

export class ImportService {
  readonly #dependencies: ImportServiceDependencies;

  constructor(dependencies: ImportServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async save(input: {
    readonly candidate: ArxivCandidate;
    readonly runID: string;
    readonly score?: number;
    readonly rank?: number;
    readonly libraryID?: number;
    readonly targetCollectionKey?: string;
    readonly targetCollectionName?: string;
  }): Promise<ImportResult> {
    const intent = stableImportIntentKey(input.candidate.arxivId);
    const existingTask = await this.#dependencies.tasks.getByIntent(intent);
    if (
      existingTask?.coreStatus === "completed" &&
      existingTask.zoteroItemKey
    ) {
      return {
        taskID: existingTask.taskID,
        itemKey: existingTask.zoteroItemKey,
        created: false,
      };
    }
    const task =
      existingTask ??
      (await this.#dependencies.tasks.create({
        taskID: `import-${input.candidate.arxivId.replace(/[^a-zA-Z0-9]/g, "-")}`,
        stableIntentKey: intent,
        arxivID: input.candidate.arxivId,
      }));
    let state: ImportCoreStatus = task.coreStatus;
    state = await this.move(task.taskID, state, "checking-duplicate");
    const duplicate = await this.#dependencies.detect(input.candidate);
    if (duplicate.status === "conflict") {
      await this.move(task.taskID, state, "conflict");
      throw new Error("检测到多个可能重复条目，需要用户确认");
    }
    const existingKey =
      duplicate.status === "match" ? duplicate.match.itemKey : undefined;
    state =
      duplicate.status === "match"
        ? await this.move(task.taskID, state, "classifying")
        : await this.move(task.taskID, state, "writing-metadata");
    const written = await this.#dependencies.items.write(
      input.candidate,
      input.libraryID,
      existingKey,
    );
    if (state === "writing-metadata")
      state = await this.move(task.taskID, state, "classifying");
    let collectionKey = input.targetCollectionKey;
    if (
      (input.targetCollectionKey || input.targetCollectionName) &&
      this.#dependencies.addCollection
    ) {
      collectionKey =
        (await this.#dependencies.addCollection(written, {
          ...(input.targetCollectionKey
            ? { key: input.targetCollectionKey }
            : {}),
          ...(input.targetCollectionName
            ? { name: input.targetCollectionName }
            : {}),
        })) ?? collectionKey;
    }
    state = await this.move(task.taskID, state, "recording-feedback");
    const event = createFeedbackDraft({
      runID: input.runID,
      arxivID: input.candidate.arxivId,
      action: "saved",
      score: input.score,
      candidateRank: input.rank,
      targetCollectionKey: collectionKey,
      zoteroItemKey: written.itemKey,
      occurredAt: new Date().toISOString(),
    });
    const feedback = await this.#dependencies.feedback.record(event);
    await this.#dependencies.tasks.update(task.taskID, {
      coreStatus: "completed",
      zoteroItemKey: written.itemKey,
      targetCollectionKey: collectionKey,
      feedbackEventID: feedback.eventID,
    });
    return {
      taskID: task.taskID,
      itemKey: written.itemKey,
      created: written.created,
      ...(duplicate.status === "match" ? { duplicate } : {}),
    };
  }

  private async move(
    taskID: string,
    from: ImportCoreStatus,
    to: ImportCoreStatus,
  ): Promise<ImportCoreStatus> {
    transitionImportState(from, to);
    await this.#dependencies.tasks.update(taskID, { coreStatus: to });
    return to;
  }
}

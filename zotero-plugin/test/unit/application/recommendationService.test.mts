import assert from "node:assert/strict";
import test from "node:test";
import { RecommendationService } from "../../../src/application/recommendationService.ts";
import {
  RunCoordinator,
  type OperationTaskRepositoryLike,
} from "../../../src/application/runCoordinator.ts";
import type { OperationTaskRecord } from "../../../src/infrastructure/storage/operationTaskRepository.ts";

class Store implements OperationTaskRepositoryLike {
  record?: OperationTaskRecord;
  async create(
    input: Parameters<OperationTaskRepositoryLike["create"]>[0],
  ): Promise<OperationTaskRecord> {
    this.record = {
      taskID: input.taskID,
      taskType: input.taskType,
      status: "queued",
      stage: "queued",
      completed: 0,
      total: input.total,
      checkpoint: input.checkpoint ?? {},
      retryCount: 0,
      createdAt: input.now ?? "now",
      updatedAt: input.now ?? "now",
    };
    return this.record;
  }
  async get(): Promise<OperationTaskRecord | undefined> {
    return this.record;
  }
  async update(
    _id: string,
    patch: Parameters<OperationTaskRepositoryLike["update"]>[1],
  ): Promise<OperationTaskRecord> {
    this.record = {
      ...this.record!,
      ...patch,
      checkpoint: patch.checkpoint ?? this.record!.checkpoint,
      status: patch.status ?? this.record!.status,
      stage: patch.stage ?? this.record!.stage,
      completed: patch.completed ?? this.record!.completed,
      total: patch.total ?? this.record!.total,
      updatedAt: patch.now ?? this.record!.updatedAt,
    };
    return this.record;
  }
  async markRunningInterrupted(): Promise<number> {
    return 0;
  }
}

test("uses the complete seven-stage recommendation pipeline in order", async () => {
  const store = new Store();
  const log: string[] = [];
  const stage = (name: string) => async () => {
    log.push(name);
    return { [name]: true };
  };
  const service = new RecommendationService(
    new RunCoordinator({ tasks: store }),
    {
      corpusCheck: stage("corpus-check"),
      profile: stage("profile"),
      arxiv: stage("arxiv"),
      candidateEmbedding: stage("candidate-embedding"),
      scoring: stage("scoring"),
      rerank: stage("rerank"),
      summary: stage("summary"),
    },
  );
  const result = await service.run({ taskID: "recommendation-1" });
  assert.equal(result.status, "completed");
  assert.deepEqual(log, [
    "corpus-check",
    "profile",
    "arxiv",
    "candidate-embedding",
    "scoring",
    "rerank",
    "summary",
  ]);
});

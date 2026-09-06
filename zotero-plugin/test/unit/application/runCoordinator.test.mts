import assert from "node:assert/strict";
import test from "node:test";
import {
  RunCoordinator,
  type OperationTaskRepositoryLike,
  type RunStage,
} from "../../../src/application/runCoordinator.ts";
import type { OperationTaskRecord } from "../../../src/infrastructure/storage/operationTaskRepository.ts";

class MemoryTasks implements OperationTaskRepositoryLike {
  readonly records = new Map<string, OperationTaskRecord>();
  async create(
    input: Parameters<OperationTaskRepositoryLike["create"]>[0],
  ): Promise<OperationTaskRecord> {
    const now = input.now ?? "2026-08-27T00:00:00Z";
    const record: OperationTaskRecord = {
      taskID: input.taskID,
      taskType: input.taskType,
      status: "queued",
      stage: "queued",
      completed: 0,
      total: input.total,
      checkpoint: input.checkpoint ?? {},
      retryCount: 0,
      ...(input.relatedRunID ? { relatedRunID: input.relatedRunID } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.taskID, record);
    return record;
  }
  async get(taskID: string): Promise<OperationTaskRecord | undefined> {
    return this.records.get(taskID);
  }
  async update(
    taskID: string,
    patch: Parameters<OperationTaskRepositoryLike["update"]>[1],
  ): Promise<OperationTaskRecord> {
    const current = this.records.get(taskID);
    if (!current) throw new Error("missing");
    const next: OperationTaskRecord = {
      ...current,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.stage ? { stage: patch.stage } : {}),
      ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
      ...(patch.total !== undefined ? { total: patch.total } : {}),
      ...(patch.checkpoint ? { checkpoint: patch.checkpoint } : {}),
      ...(patch.retryCount !== undefined
        ? { retryCount: patch.retryCount }
        : {}),
      ...(patch.errorCode ? { errorCode: patch.errorCode } : {}),
      ...(patch.errorMessage ? { errorMessage: patch.errorMessage } : {}),
      ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
      ...(patch.completedAt ? { completedAt: patch.completedAt } : {}),
      updatedAt: patch.now ?? current.updatedAt,
    };
    this.records.set(taskID, next);
    return next;
  }
  async markRunningInterrupted(): Promise<number> {
    let count = 0;
    for (const [id, task] of this.records) {
      if (task.status === "running") {
        this.records.set(id, {
          ...task,
          status: "interrupted",
          stage: "interrupted",
        });
        count += 1;
      }
    }
    return count;
  }
}

function stages(log: string[], wait?: Promise<void>): RunStage[] {
  return ["corpus-check", "profile", "arxiv"].map((name) => ({
    name,
    async run({ report }) {
      log.push(name);
      if (wait) await wait;
      await report(log.length, 3, { [name]: true });
      return { [`done:${name}`]: true };
    },
  }));
}

test("runs stages in order and persists a checkpoint after each stage", async () => {
  const tasks = new MemoryTasks();
  const coordinator = new RunCoordinator({
    tasks,
    now: () => "2026-08-27T00:00:00Z",
  });
  const log: string[] = [];
  const result = await coordinator.start({
    taskID: "run-1",
    taskType: "recommendation",
    stages: stages(log),
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(log, ["corpus-check", "profile", "arxiv"]);
  assert.equal(tasks.records.get("run-1")?.checkpoint["done:arxiv"], true);
});

test("cancellation keeps the last checkpoint and resume is explicit", async () => {
  const tasks = new MemoryTasks();
  const coordinator = new RunCoordinator({ tasks });
  const log: string[] = [];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = coordinator.start({
    taskID: "run-2",
    taskType: "recommendation",
    stages: stages(log, wait),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await coordinator.cancel("run-2");
  release();
  assert.equal((await running).status, "cancelled");
  assert.ok(tasks.records.get("run-2")?.checkpoint["corpus-check"]);
  await tasks.update("run-2", { status: "interrupted", stage: "corpus-check" });
  const resumed = await coordinator.resume("run-2", stages(log));
  assert.equal(resumed.status, "completed");
});

test("only one in-process task can be active and stale running tasks become interrupted", async () => {
  const tasks = new MemoryTasks();
  const coordinator = new RunCoordinator({ tasks });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = coordinator.start({
    taskID: "run-3",
    taskType: "profile",
    stages: [{ name: "profile", run: async () => wait }],
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(
    coordinator.start({
      taskID: "run-4",
      taskType: "recommendation",
      stages: [],
    }),
    /已有/,
  );
  release();
  await first;
  const stale = await tasks.create({
    taskID: "run-5",
    taskType: "recommendation",
    total: 1,
  });
  await tasks.update(stale.taskID, { status: "running", stage: "arxiv" });
  assert.equal(await coordinator.markInterrupted(), 1);
  assert.equal((await tasks.get("run-5"))?.status, "interrupted");
});

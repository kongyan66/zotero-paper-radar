import { assert } from "chai";
import { config } from "../../package.json";
import type { OperationTaskRepository } from "../../src/infrastructure/storage/operationTaskRepository";
import { TaskCenterController } from "../../src/ui/tasks/taskCenterController";

interface TaskAddon {
  data: {
    operationTaskRepository?: OperationTaskRepository;
  };
}

describe("persistent task center", function () {
  it("persists task progress and converts legacy running tasks to interrupted", async function () {
    const instance = Zotero[config.addonInstance] as unknown as TaskAddon;
    assert.exists(instance.data.operationTaskRepository);
    const repository = instance.data.operationTaskRepository!;
    const taskID = `test-task-${Date.now().toString(36)}`;
    await repository.create({ taskID, taskType: "recommendation", total: 7 });
    await repository.update(taskID, {
      status: "running",
      stage: "arxiv",
      completed: 2,
      checkpoint: { cacheHits: 4 },
    });
    assert.equal((await repository.get(taskID))?.stage, "arxiv");
    assert.equal(await repository.markRunningInterrupted(), 1);
    assert.equal((await repository.get(taskID))?.status, "interrupted");
    await repository.update(taskID, { status: "cancelled" });
  });

  it("renders a persisted task and exposes the appropriate continue action", async function () {
    const win = Zotero.getMainWindow()!;
    const repository = (Zotero[config.addonInstance] as unknown as TaskAddon)
      .data.operationTaskRepository!;
    const taskID = `test-controller-${Date.now().toString(36)}`;
    await repository.create({ taskID, taskType: "recommendation", total: 7 });
    await repository.update(taskID, {
      status: "interrupted",
      stage: "arxiv",
      checkpoint: {
        query: { count: 10 },
        completedStage: "summary",
        arxivCount: 56,
        candidateCount: 54,
        runCandidateCount: 10,
        cacheHits: 54,
        embeddingRequested: 0,
      },
    });
    const host = win.document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    let resumed = "";
    let profileUpdates = 0;
    const controller = new TaskCenterController(
      host.ownerDocument,
      repository,
      {
        cancel: () => undefined,
        resume: (id) => {
          resumed = id;
        },
        retry: () => undefined,
      },
      {
        onTaskUpdated: (task) => {
          if (
            task.taskType === "build-profile" &&
            task.status === "completed"
          ) {
            profileUpdates += 1;
          }
        },
      },
    );
    await controller.mount(host);
    assert.exists(host.querySelector("[data-task-status='interrupted']"));
    assert.equal(
      host.querySelector("[data-role='recommendation-flow']")?.textContent,
      "检索 56篇 · 候选 54篇 · 推荐 10篇",
    );
    assert.equal(
      host.querySelector("[data-role='embedding-flow']")?.textContent,
      "向量复用 54篇 · 新计算 0篇 · 目标 10篇",
    );
    const secondTaskID = `test-controller-second-${Date.now().toString(36)}`;
    await repository.create({
      taskID: secondTaskID,
      taskType: "build-profile",
      total: 3,
    });
    await Zotero.Promise.delay(25);
    assert.exists(host.querySelector("[data-task-status='queued']"));
    const button = host.querySelector<HTMLButtonElement>(
      "[data-task-status='interrupted'] button",
    );
    button?.click();
    assert.equal(resumed, taskID);
    await repository.update(secondTaskID, {
      status: "completed",
      stage: "completed",
      completed: 3,
    });
    await Zotero.Promise.delay(25);
    assert.equal(profileUpdates, 1);
    controller.destroy();
    await repository.update(taskID, { status: "cancelled" });
    await repository.update(secondTaskID, { status: "cancelled" });
  });

  it("clears only historical task records", async function () {
    const instance = Zotero[config.addonInstance] as unknown as TaskAddon;
    const repository = instance.data.operationTaskRepository!;
    const completedID = `clear-completed-${Date.now().toString(36)}`;
    const queuedID = `clear-queued-${Date.now().toString(36)}`;
    const runningID = `clear-running-${Date.now().toString(36)}`;
    await repository.create({
      taskID: completedID,
      taskType: "recommendation",
      total: 7,
    });
    await repository.update(completedID, { status: "completed" });
    await repository.create({
      taskID: queuedID,
      taskType: "recommendation",
      total: 7,
    });
    await repository.create({
      taskID: runningID,
      taskType: "recommendation",
      total: 7,
    });
    await repository.update(runningID, { status: "running" });

    assert.isTrue(await repository.clearHistoryTask(completedID));
    assert.notExists(await repository.get(completedID));
    let rejected = false;
    try {
      await repository.clearHistoryTask(runningID);
    } catch (error) {
      rejected = true;
      assert.include(String(error), "运行中或排队");
    }
    assert.isTrue(rejected);

    await repository.clearHistory();
    assert.exists(await repository.get(queuedID));
    assert.exists(await repository.get(runningID));
    await repository.update(queuedID, { status: "cancelled" });
    await repository.update(runningID, { status: "cancelled" });
    await repository.clearHistory();
  });
});

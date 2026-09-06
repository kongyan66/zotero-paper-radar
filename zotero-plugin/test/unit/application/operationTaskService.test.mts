import assert from "node:assert/strict";
import test from "node:test";
import { OperationTaskService } from "../../../src/application/operationTaskService.ts";

test("task service delegates cancel and list operations", async () => {
  let cancelled = "";
  const tasks = { list: async () => [] } as never;
  const coordinator = {
    cancel: async (id: string) => {
      cancelled = id;
    },
    resume: async () => ({ taskID: "x", status: "completed", checkpoint: {} }),
  } as never;
  const service = new OperationTaskService(tasks, coordinator);
  await service.cancel("task-1");
  assert.equal(cancelled, "task-1");
  assert.deepEqual(await service.list(), []);
});

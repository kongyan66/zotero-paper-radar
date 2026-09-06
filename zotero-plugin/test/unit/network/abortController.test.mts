import assert from "node:assert/strict";
import test from "node:test";
import { createAbortController } from "../../../src/infrastructure/network/abortController.ts";

test("creates a cancellable controller in the Node test host", () => {
  const controller = createAbortController();

  assert.equal(controller.signal.aborted, false);
  controller.abort();
  assert.equal(controller.signal.aborted, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransition,
  stableImportIntentKey,
  transitionImportState,
} from "../../../src/domain/importing/importStateMachine.ts";

test("import core follows the strict resumable state machine", () => {
  assert.equal(canTransition("queued", "checking-duplicate"), true);
  assert.equal(canTransition("queued", "completed"), false);
  assert.equal(
    transitionImportState("writing-metadata", "classifying"),
    "classifying",
  );
  assert.throws(
    () => transitionImportState("completed", "writing-metadata"),
    /非法/,
  );
});

test("stable intent ignores arXiv version suffix", () => {
  assert.equal(stableImportIntentKey("2608.24845v2"), "arxiv:2608.24845:save");
  assert.equal(
    stableImportIntentKey("2608.24845v1"),
    stableImportIntentKey("2608.24845v2"),
  );
});

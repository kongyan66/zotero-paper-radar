import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeedbackDraft,
  isPaperSuppressed,
  isSemanticNegative,
} from "../../../src/domain/feedback/feedbackPolicy.ts";

test("feedback drafts have stable idempotency keys and duplicate saves do not retrain", () => {
  const request = {
    runID: "run-1",
    arxivID: "2608.00001",
    action: "saved" as const,
    profileLineageIDs: ["b", "a"],
    occurredAt: "2026-08-27T00:00:00Z",
  };
  assert.deepEqual(createFeedbackDraft(request).profileLineageIDs, ["a", "b"]);
  assert.equal(
    createFeedbackDraft(request).idempotencyKey,
    createFeedbackDraft({ ...request, profileLineageIDs: ["a", "b"] })
      .idempotencyKey,
  );
});

test("only topic rejection is semantic negative and deferred expires after seven days", () => {
  const now = new Date("2026-08-27T00:00:00Z");
  assert.equal(isSemanticNegative("rejected-topic"), true);
  assert.equal(isSemanticNegative("duplicate"), false);
  assert.equal(isPaperSuppressed("saved", "2020-01-01T00:00:00Z", now), true);
  assert.equal(
    isPaperSuppressed("deferred", "2026-08-23T00:00:00Z", now),
    true,
  );
  assert.equal(
    isPaperSuppressed("deferred", "2026-08-19T00:00:00Z", now),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  FixedClock,
  createRunId,
  dateWindowEndingNow,
} from "../../../src/shared/clock.ts";

test("a fixed clock produces repeatable run identifiers", () => {
  const clock = new FixedClock("2026-08-26T08:30:00.000Z");

  assert.equal(
    createRunId("recommendation", clock),
    "recommendation-20260826T083000000Z",
  );
  assert.equal(
    createRunId("recommendation", clock),
    "recommendation-20260826T083000000Z",
  );
});

test("date windows use UTC and include the fixed current time", () => {
  const clock = new FixedClock("2026-08-26T08:30:00.000Z");

  assert.deepEqual(dateWindowEndingNow(3, clock), {
    from: new Date("2026-08-23T08:30:00.000Z"),
    to: new Date("2026-08-26T08:30:00.000Z"),
  });
  assert.throws(() => dateWindowEndingNow(0, clock), /positive integer/);
});

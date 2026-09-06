import assert from "node:assert/strict";
import test from "node:test";
import { FixedClock } from "../../../src/shared/clock.ts";
import {
  formatArxivDate,
  resolveArxivDateWindow,
} from "../../../src/domain/candidates/dateWindow.ts";

const clock = new FixedClock("2026-08-27T08:00:00.000Z");

test("uses three days first, resumes from last success, and caps automatic lookback", () => {
  assert.equal(resolveArxivDateWindow({ clock }).days, 3);
  const resumed = resolveArxivDateWindow({
    clock,
    lastSuccessfulAt: "2026-08-25T08:00:00Z",
  });
  assert.equal(resumed.source, "last-success");
  assert.equal(resumed.from.toISOString(), "2026-08-25T08:00:00.000Z");
  assert.equal(
    resolveArxivDateWindow({ clock, lastSuccessfulAt: "2026-08-01T08:00:00Z" })
      .days,
    7,
  );
});

test("manual window is limited to fourteen days", () => {
  const window = resolveArxivDateWindow({ clock, manualDays: 14 });
  assert.equal(window.source, "manual");
  assert.equal(window.from.toISOString(), "2026-08-13T08:00:00.000Z");
  assert.throws(
    () => resolveArxivDateWindow({ clock, manualDays: 15 }),
    /between 1 and 14/,
  );
});

test("formats submittedDate in arXiv's UTC YYYYMMDDHHMM format", () => {
  assert.equal(
    formatArxivDate(new Date("2026-08-27T08:05:42.123Z")),
    "202608270805",
  );
});

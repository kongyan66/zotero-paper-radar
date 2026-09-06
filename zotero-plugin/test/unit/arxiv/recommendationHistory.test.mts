import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHistoryDayLabel,
  localDayKey,
  recommendationHistoryStart,
} from "../../../src/domain/recommendations/recommendationHistory.ts";

test("groups timestamps by the local calendar day", () => {
  const now = new Date(2026, 8, 4, 14, 0, 0);

  assert.equal(localDayKey(now), "2026-09-04");
  assert.equal(localDayKey(new Date(2026, 8, 4, 0, 1, 0)), "2026-09-04");
  assert.equal(localDayKey("not-a-date"), undefined);
  assert.equal(formatHistoryDayLabel("2026-09-04", now), "今天 · 2026-09-04");
  assert.equal(formatHistoryDayLabel("2026-09-03", now), "昨天 · 2026-09-03");
});

test("keeps today plus the six preceding local dates", () => {
  const start = recommendationHistoryStart(new Date(2026, 8, 4, 23, 30), 7);

  assert.equal(localDayKey(start), "2026-08-29");
  assert.equal(
    recommendationHistoryStart(new Date(2026, 8, 4), 1).toDateString(),
    new Date(2026, 8, 4).toDateString(),
  );
  assert.throws(
    () => recommendationHistoryStart(new Date(2026, 8, 4), 0),
    /正整数/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { zoteroPapers } from "../../fixtures/papers.ts";
import {
  ProfileBuilder,
  shouldRebuildProfiles,
} from "../../../src/domain/profiles/profileBuilder.ts";

test("profile builder creates recent and long-term profiles with lineage-ready metadata", () => {
  const papers = Array.from({ length: 30 }, (_, index) => ({
    ...zoteroPapers[index % 3],
    itemKey: `${zoteroPapers[index % 3].itemKey}-${index}`,
    dateAdded: "2026-08-01T00:00:00.000Z",
  }));
  const vectors = new Map(
    papers.map((paper, index) => [
      paper.itemKey,
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ][index % 3],
    ]),
  );
  const result = new ProfileBuilder({
    seed: 42,
    now: () => new Date("2026-08-27"),
  }).build({
    papers,
    vectors,
    reason: "initial",
  });

  assert.equal(
    result.profiles.some((profile) => profile.horizon === "recent"),
    true,
  );
  assert.equal(
    result.profiles.some((profile) => profile.horizon === "long-term"),
    true,
  );
  assert.equal(
    result.profiles.every(
      (profile) => profile.representativeItemKeys.length > 0,
    ),
    true,
  );
  assert.equal(result.algorithmConfig.recentWindowDays, 90);
  assert.equal(result.algorithmConfig.recentHalfLifeDays, 30);
});

test("full rebuild triggers at the planned change thresholds", () => {
  const base = {
    lastBuiltAt: "2026-08-01T00:00:00.000Z",
    previousCorpusCount: 100,
    currentCorpusCount: 105,
    previousMemberCount: 100,
    currentMemberCount: 105,
    previousCentroid: [1, 0],
    currentCentroid: [1, 0],
    now: "2026-08-30T00:00:00.000Z",
  };
  assert.equal(shouldRebuildProfiles(base).fullRebuild, false);
  assert.equal(
    shouldRebuildProfiles({ ...base, currentCorpusCount: 111 }).fullRebuild,
    true,
  );
  assert.equal(
    shouldRebuildProfiles({
      ...base,
      lastBuiltAt: "2026-07-01T00:00:00.000Z",
    }).fullRebuild,
    true,
  );
  assert.equal(
    shouldRebuildProfiles({ ...base, currentMemberCount: 121 }).fullRebuild,
    true,
  );
  assert.equal(
    shouldRebuildProfiles({ ...base, currentCentroid: [0, 1] }).fullRebuild,
    true,
  );
});

test("lineage follows members when the generated topic name changes", () => {
  const papers = zoteroPapers.map((paper) => ({
    ...paper,
    dateAdded: "2026-08-01T00:00:00.000Z",
  }));
  const vectors = new Map([
    ["DOC00001", [1, 0, 0]],
    ["VISION01", [0, 1, 0]],
    ["LONGTAIL", [0, 0, 1]],
  ]);
  const first = new ProfileBuilder({
    seed: 42,
    now: () => new Date("2026-08-27"),
  }).build({ papers, vectors, reason: "initial" });
  const renamedPrevious = first.profiles.map((profile) => ({
    ...profile,
    name: `用户命名 ${profile.horizon}`,
    locked: true,
  }));
  const second = new ProfileBuilder({
    seed: 42,
    now: () => new Date("2026-08-28"),
  }).build({
    papers,
    vectors,
    reason: "rebuild",
    previousProfiles: renamedPrevious,
  });
  for (const previous of renamedPrevious) {
    assert.ok(
      second.profiles.some(
        (profile) =>
          profile.horizon === previous.horizon &&
          profile.lineageId === previous.lineageId,
      ),
    );
  }
});

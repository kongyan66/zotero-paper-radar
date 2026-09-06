import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDataset } from "../../../src/evaluation/report.ts";
import {
  matchFeedbackPaper,
  sliceAt,
} from "../../../src/evaluation/timeReplay.ts";
import type {
  ReplayDataset,
  ReplayPaper,
} from "../../../src/evaluation/types.ts";

test("过去截点不读取未来论文或未来反馈", () => {
  const dataset: ReplayDataset = {
    papers: [paper("past", "2026-01-01"), paper("future", "2026-02-01")],
    feedback: [
      { paperID: "past", action: "saved", occurredAt: "2026-01-05" },
      { paperID: "future", action: "saved", occurredAt: "2026-02-05" },
    ],
    cutoffs: ["2026-01-15"],
  };

  const slice = sliceAt(dataset, "2026-01-15", "2026-02-10");
  assert.deepEqual(slice.historicalPaperIDs, ["past"]);
  assert.equal(slice.historicalFeedbackCount, 1);
  assert.deepEqual(slice.candidateIDs, ["future"]);
  assert.deepEqual(slice.relevantPaperIDs, ["future"]);
});

test("窗口内保存旧论文不会污染当前候选的正例集合", () => {
  const dataset: ReplayDataset = {
    papers: [paper("old", "2025-12-01"), paper("new", "2026-02-01")],
    feedback: [
      { paperID: "old", action: "saved", occurredAt: "2026-01-20" },
      { paperID: "new", action: "saved", occurredAt: "2026-02-05" },
    ],
    cutoffs: [],
  };
  const slice = sliceAt(dataset, "2026-01-15", "2026-02-10");
  assert.deepEqual(slice.relevantPaperIDs, ["new"]);
});

test("历史正例按 arXiv ID、DOI 和标题年份依次匹配", () => {
  const dataset: ReplayDataset = {
    papers: [
      { ...paper("a", "2026-01-01"), arxivID: "2601.00001v2" },
      { ...paper("b", "2026-01-01"), doi: "10.1000/ABC" },
      { ...paper("c", "2026-01-01"), title: "Vision & Language", year: 2026 },
    ],
    feedback: [],
    cutoffs: [],
  };

  assert.deepEqual(
    matchFeedbackPaper(
      {
        arxivID: "arXiv:2601.00001",
        action: "saved",
        occurredAt: "2026-02-01",
      },
      dataset,
    ),
    { paperID: "a", reason: "arxiv-id" },
  );
  assert.equal(
    matchFeedbackPaper(
      {
        doi: "https://doi.org/10.1000/abc",
        action: "saved",
        occurredAt: "2026-02-01",
      },
      dataset,
    ).paperID,
    "b",
  );
  assert.equal(
    matchFeedbackPaper(
      {
        title: "Vision Language",
        year: 2026,
        action: "saved",
        occurredAt: "2026-02-01",
      },
      dataset,
    ).paperID,
    "c",
  );
});

test("少于二十个正例标记证据不足，足量夹具可验证新版质量门槛", () => {
  const insufficient = evaluationFixture(3);
  assert.equal(evaluateDataset(insufficient).dataset.evidenceSufficient, false);

  const sufficient = evaluationFixture(5);
  const report = evaluateDataset(sufficient, {
    recentSimilarity: 0,
    longTermSimilarity: 0,
    representativeSimilarity: 0.6,
    keywordMatch: 0.3,
    manualPriority: 0.1,
    negativeSimilarity: -0.2,
  });
  assert.equal(report.dataset.cutoffCount, 5);
  assert.equal(report.dataset.matchedPositiveCount, 20);
  assert.equal(report.dataset.evidenceSufficient, true);
  assert.equal(report.methods.length, 3);
  assert.equal(report.pass, true);
});

function evaluationFixture(cutoffCount: number): ReplayDataset {
  const papers: ReplayPaper[] = [];
  const feedback: ReplayDataset["feedback"][number][] = [];
  const cutoffs: string[] = [];
  for (let month = 0; month < cutoffCount; month += 1) {
    const cutoff = new Date(Date.UTC(2026, month, 1));
    cutoffs.push(cutoff.toISOString());
    for (let index = 0; index < 12; index += 1) {
      const positive = index >= 8;
      const paperID = `${month}-${index}`;
      papers.push({
        ...paper(paperID, new Date(Date.UTC(2026, month, 2)).toISOString()),
        profileIDs: [positive ? "wanted" : "noise"],
        features: positive
          ? { ...emptyFeatures, representativeSimilarity: 1, keywordMatch: 1 }
          : { ...emptyFeatures, recentSimilarity: 1, longTermSimilarity: 1 },
      });
      if (positive) {
        feedback.push({
          paperID,
          action: "saved",
          occurredAt: new Date(Date.UTC(2026, month, 3)).toISOString(),
        });
      }
    }
  }
  return { papers, feedback, cutoffs, candidateWindowDays: 28 };
}

const emptyFeatures = {
  recentSimilarity: 0,
  longTermSimilarity: 0,
  representativeSimilarity: 0,
  keywordMatch: 0,
  manualPriority: 0,
  negativeSimilarity: 0,
} as const;

function paper(paperID: string, publishedAt: string): ReplayPaper {
  return {
    paperID,
    publishedAt,
    profileIDs: ["profile"],
    vector: [1, 0],
    features: emptyFeatures,
  };
}

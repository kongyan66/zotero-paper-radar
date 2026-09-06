import {
  averageMetrics,
  calculateReplayMetrics,
  type ReplayMetrics,
} from "./metrics.ts";
import { buildEvaluationMethods, type EvaluationMethod } from "./baselines.ts";
import {
  buildReplaySlices,
  matchFeedbackPaper,
  paperMap,
} from "./timeReplay.ts";
import type { FeedbackMatchReason, ReplayDataset } from "./types.ts";
import type { RankingWeights } from "../domain/ranking/features.ts";

export interface MethodReport {
  readonly id: EvaluationMethod["id"];
  readonly label: string;
  readonly aggregate: ReplayMetrics;
  readonly byCutoff: readonly {
    readonly cutoff: string;
    readonly candidateCount: number;
    readonly relevantCount: number;
    readonly metrics: ReplayMetrics;
    readonly rankedIDs: readonly string[];
  }[];
}

export interface EvaluationReport {
  readonly generatedAt: string;
  readonly dataset: {
    readonly paperCount: number;
    readonly feedbackCount: number;
    readonly positiveCount: number;
    readonly cutoffCount: number;
    readonly matchedPositiveCount: number;
    readonly evidenceSufficient: boolean;
    readonly ranges: {
      readonly papers?: readonly [string, string];
      readonly feedback?: readonly [string, string];
      readonly cutoffs?: readonly [string, string];
    };
    readonly exclusions: Readonly<Partial<Record<FeedbackMatchReason, number>>>;
  };
  readonly pass: boolean;
  readonly gateReason: string;
  readonly methods: readonly MethodReport[];
}

export function evaluateDataset(
  dataset: ReplayDataset,
  weights?: RankingWeights,
  generatedAt = new Date().toISOString(),
): EvaluationReport {
  const slices = buildReplaySlices(dataset);
  const lookup = paperMap(dataset);
  const methods = buildEvaluationMethods(weights);
  const methodReports = methods.map((method) => {
    const byCutoff = slices.map((slice) => {
      const papers = slice.candidateIDs
        .map((paperID) => lookup.get(paperID))
        .filter((paper) => paper !== undefined);
      const rankedIDs = method.rank(papers);
      const metrics = calculateReplayMetrics(
        rankedIDs,
        slice.relevantPaperIDs,
        lookup,
      );
      return {
        cutoff: slice.cutoff,
        candidateCount: papers.length,
        relevantCount: slice.relevantPaperIDs.length,
        metrics,
        rankedIDs,
      };
    });
    return {
      id: method.id,
      label: method.label,
      aggregate: averageMetrics(byCutoff.map((item) => item.metrics)),
      byCutoff,
    };
  });
  const positiveMatches = dataset.feedback
    .filter((event) => event.action === "saved")
    .map((event) => matchFeedbackPaper(event, dataset));
  const matchedPositiveCount = new Set(
    positiveMatches
      .map((match) => match.paperID)
      .filter((paperID) => paperID !== undefined),
  ).size;
  const exclusions = positiveMatches
    .filter((match) => !match.paperID)
    .reduce<Partial<Record<FeedbackMatchReason, number>>>((counts, match) => {
      counts[match.reason] = (counts[match.reason] ?? 0) + 1;
      return counts;
    }, {});
  const evidenceSufficient = slices.length >= 5 && matchedPositiveCount >= 20;
  const newer = methodReports.find(
    (method) => method.id === "new-explainable",
  )!;
  const baselines = methodReports.filter(
    (method) => method.id !== "new-explainable",
  );
  const strongestNdcg5 = Math.max(
    ...baselines.map((method) => method.aggregate.ndcgAt5),
  );
  const strongestRecall10 = Math.max(
    ...baselines.map((method) => method.aggregate.recallAt10),
  );
  const ndcgImproved = newer.aggregate.ndcgAt5 >= strongestNdcg5 * 1.1;
  const recallImproved = newer.aggregate.recallAt10 >= strongestRecall10 * 1.1;
  const otherMetricStable = ndcgImproved
    ? newer.aggregate.recallAt10 >= strongestRecall10 * 0.98
    : newer.aggregate.ndcgAt5 >= strongestNdcg5 * 0.98;
  const pass =
    evidenceSufficient && (ndcgImproved || recallImproved) && otherMetricStable;
  return {
    generatedAt,
    dataset: {
      paperCount: dataset.papers.length,
      feedbackCount: dataset.feedback.length,
      positiveCount: dataset.feedback.filter(
        (event) => event.action === "saved",
      ).length,
      cutoffCount: slices.length,
      matchedPositiveCount,
      evidenceSufficient,
      ranges: {
        papers: dateRange(dataset.papers.map((paper) => paper.publishedAt)),
        feedback: dateRange(dataset.feedback.map((event) => event.occurredAt)),
        cutoffs: dateRange(dataset.cutoffs),
      },
      exclusions,
    },
    pass,
    gateReason: !evidenceSufficient
      ? "证据不足：至少需要 5 个截点和 20 个可匹配历史正例"
      : pass
        ? "新版相对更强基线达到 nDCG@5 或 Recall@10 提升 10%，另一项下降不超过 2%"
        : "新版未达到相对更强基线的离线质量门槛",
    methods: methodReports,
  };
}

export function renderMarkdownReport(report: EvaluationReport): string {
  const lines = [
    "# Recommendation Evaluation",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Evidence: ${report.dataset.evidenceSufficient ? "sufficient" : "insufficient"}`,
    `- Gate: ${report.pass ? "PASS" : "BETA / NOT PASSED"}`,
    `- Reason: ${report.gateReason}`,
    `- Paper range: ${formatRange(report.dataset.ranges.papers)}`,
    `- Feedback range: ${formatRange(report.dataset.ranges.feedback)}`,
    `- Cutoff range: ${formatRange(report.dataset.ranges.cutoffs)}`,
    `- Excluded positives: ${JSON.stringify(report.dataset.exclusions)}`,
    "",
    "| Method | nDCG@5 | Recall@10 | MRR | Profile coverage | Single-profile share |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const method of report.methods) {
    lines.push(
      `| ${method.label} | ${format(method.aggregate.ndcgAt5)} | ${format(method.aggregate.recallAt10)} | ${format(method.aggregate.mrr)} | ${format(method.aggregate.profileCoverage)} | ${format(method.aggregate.singleProfileShare)} |`,
    );
  }
  lines.push("", "## Cutoffs", "");
  for (const method of report.methods) {
    lines.push(`### ${method.label}`);
    for (const item of method.byCutoff) {
      lines.push(
        `- ${item.cutoff}: candidates=${item.candidateCount}, relevant=${item.relevantCount}, nDCG@5=${format(item.metrics.ndcgAt5)}, Recall@10=${format(item.metrics.recallAt10)}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function dateRange(
  values: readonly string[],
): readonly [string, string] | undefined {
  const valid = values
    .map((value) => Date.parse(value))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  return valid.length
    ? [new Date(valid[0]).toISOString(), new Date(valid.at(-1)!).toISOString()]
    : undefined;
}

function formatRange(range?: readonly [string, string]): string {
  return range ? `${range[0]} .. ${range[1]}` : "n/a";
}

function format(value: number): string {
  return value.toFixed(4);
}

import { DEFAULT_RANKING_WEIGHTS } from "../domain/ranking/defaultWeights.ts";
import type { RankingWeights } from "../domain/ranking/features.ts";
import type { ReplayPaper } from "./types.ts";

export interface EvaluationMethod {
  readonly id: "single-centroid" | "legacy-7d54812" | "new-explainable";
  readonly label: string;
  rank(papers: readonly ReplayPaper[]): readonly string[];
}

export const LEGACY_WEIGHTS: RankingWeights = {
  recentSimilarity: 0.6,
  longTermSimilarity: 0.4,
  representativeSimilarity: 0,
  keywordMatch: 0,
  manualPriority: 0,
  negativeSimilarity: 0,
};

export function buildEvaluationMethods(
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): readonly EvaluationMethod[] {
  return [
    {
      id: "single-centroid",
      label: "全库单质心余弦排序",
      rank: (papers) =>
        rankByScore(papers, (paper) => paper.features.recentSimilarity),
    },
    {
      id: "legacy-7d54812",
      label: "7d54812 等价近期/长期多画像",
      rank: (papers) =>
        rankByScore(papers, (paper) => dot(paper, LEGACY_WEIGHTS)),
    },
    {
      id: "new-explainable",
      label: "新版可解释六特征排序",
      rank: (papers) => rankByScore(papers, (paper) => dot(paper, weights)),
    },
  ];
}

function rankByScore(
  papers: readonly ReplayPaper[],
  score: (paper: ReplayPaper) => number,
): readonly string[] {
  return [...papers]
    .sort(
      (left, right) =>
        score(right) - score(left) ||
        Date.parse(right.publishedAt) - Date.parse(left.publishedAt) ||
        left.paperID.localeCompare(right.paperID),
    )
    .map((paper) => paper.paperID);
}

function dot(paper: ReplayPaper, weights: RankingWeights): number {
  return (
    paper.features.recentSimilarity * weights.recentSimilarity +
    paper.features.longTermSimilarity * weights.longTermSimilarity +
    paper.features.representativeSimilarity * weights.representativeSimilarity +
    paper.features.keywordMatch * weights.keywordMatch +
    paper.features.manualPriority * weights.manualPriority +
    paper.features.negativeSimilarity * weights.negativeSimilarity
  );
}

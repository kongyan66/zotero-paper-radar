import type { RankingFeatureVector } from "../domain/feedback/logisticWeightLearner.ts";

export interface ReplayPaper {
  readonly paperID: string;
  readonly arxivID?: string;
  readonly doi?: string;
  readonly title?: string;
  readonly year?: number;
  readonly publishedAt: string;
  readonly profileIDs: readonly string[];
  readonly vector: readonly number[];
  readonly features: RankingFeatureVector;
}

export interface ReplayFeedback {
  readonly paperID?: string;
  readonly arxivID?: string;
  readonly doi?: string;
  readonly title?: string;
  readonly year?: number;
  readonly action:
    | "saved"
    | "rejected-topic"
    | "deferred"
    | "already-read"
    | "duplicate";
  readonly occurredAt: string;
}

export type FeedbackMatchReason =
  | "paper-id"
  | "arxiv-id"
  | "doi"
  | "title-year"
  | "missing-identifiers"
  | "not-found"
  | "ambiguous";

export interface FeedbackMatch {
  readonly paperID?: string;
  readonly reason: FeedbackMatchReason;
}

export interface ReplayDataset {
  readonly papers: readonly ReplayPaper[];
  readonly feedback: readonly ReplayFeedback[];
  readonly cutoffs: readonly string[];
  readonly candidateWindowDays?: number;
}

export interface ReplaySlice {
  readonly cutoff: string;
  readonly windowEnd: string;
  readonly historicalPaperIDs: readonly string[];
  readonly historicalFeedbackCount: number;
  readonly candidateIDs: readonly string[];
  readonly relevantPaperIDs: readonly string[];
}

import { stableHash } from "../../shared/stableHash.ts";

export type RecommendationFeedbackAction =
  | "saved"
  | "deferred"
  | "rejected-topic"
  | "already-read"
  | "duplicate"
  | "classification-corrected";

export interface FeedbackRequest {
  readonly runID: string;
  readonly arxivID: string;
  readonly action: RecommendationFeedbackAction;
  readonly profileLineageIDs?: readonly string[];
  readonly score?: number;
  readonly candidateRank?: number;
  readonly targetCollectionKey?: string;
  readonly zoteroItemKey?: string;
  readonly occurredAt: string;
}

export interface FeedbackEventDraft extends FeedbackRequest {
  readonly eventID: string;
  readonly idempotencyKey: string;
}

export function createFeedbackDraft(
  request: FeedbackRequest,
): FeedbackEventDraft {
  const profileIDs = [...(request.profileLineageIDs ?? [])].sort();
  const idempotencyKey = [
    request.runID,
    request.arxivID,
    request.action,
    profileIDs.join(","),
  ].join(":");
  return {
    ...request,
    profileLineageIDs: profileIDs,
    eventID: `feedback-${stableHash(idempotencyKey)}`,
    idempotencyKey,
  };
}

export function isSemanticNegative(
  action: RecommendationFeedbackAction,
): boolean {
  return action === "rejected-topic";
}

export function isPaperSuppressed(
  action: RecommendationFeedbackAction,
  occurredAt: string,
  now: Date,
): boolean {
  if (["saved", "rejected-topic", "already-read", "duplicate"].includes(action))
    return true;
  if (action !== "deferred") return false;
  return now.getTime() - Date.parse(occurredAt) < 7 * 24 * 60 * 60 * 1000;
}

export function isTrainingSignal(
  action: RecommendationFeedbackAction,
): boolean {
  return action === "saved" || action === "rejected-topic";
}

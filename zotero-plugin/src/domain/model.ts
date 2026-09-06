export type ZoteroPaperType = "journalArticle" | "conferencePaper" | "preprint";

export interface ZoteroPaper {
  readonly libraryId: number;
  readonly itemKey: string;
  readonly itemVersion: number;
  readonly itemType: ZoteroPaperType;
  readonly title: string;
  readonly abstract: string;
  readonly dateAdded: string;
  readonly publicationDate?: string;
  readonly collectionKeys: readonly string[];
  readonly tags: readonly string[];
}

export interface ArxivCandidate {
  readonly arxivId: string;
  readonly version: number;
  readonly title: string;
  readonly abstract: string;
  readonly authors: readonly string[];
  readonly categories: readonly string[];
  readonly submittedAt: string;
  readonly updatedAt?: string;
  readonly doi?: string;
  readonly abstractUrl: string;
  readonly pdfUrl: string;
}

export type ProfileHorizon = "recent" | "long-term" | "manual";

export interface InterestProfile {
  readonly id: string;
  readonly lineageId: string;
  readonly versionId: string;
  readonly horizon: ProfileHorizon;
  readonly name: string;
  readonly keywords: readonly string[];
  readonly centroid: readonly number[];
  readonly representativeItemKeys: readonly string[];
  readonly memberCount: number;
  readonly weight: number;
  readonly locked: boolean;
  readonly disabled: boolean;
}

export interface ScoreBreakdown {
  readonly recentSimilarity: number;
  readonly longTermSimilarity: number;
  readonly representativeSimilarity: number;
  readonly keywordMatch: number;
  readonly manualPriority: number;
  readonly negativeSimilarity: number;
  readonly rawScore: number;
  readonly diversityAdjustment: number;
  readonly rerankedScore: number;
  readonly displayScore: number;
}

export type FeedbackAction =
  | "saved"
  | "deferred"
  | "rejected-topic"
  | "already-read"
  | "duplicate"
  | "classification-corrected";

export interface FeedbackEvent {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly runId: string;
  readonly arxivId: string;
  readonly action: FeedbackAction;
  readonly profileIds: readonly string[];
  readonly score: number;
  readonly occurredAt: string;
  readonly zoteroItemKey?: string;
  readonly collectionKey?: string;
}

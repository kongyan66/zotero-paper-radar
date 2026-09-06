import type {
  FeedbackMatch,
  ReplayDataset,
  ReplayFeedback,
  ReplayPaper,
  ReplaySlice,
} from "./types.ts";

export function buildReplaySlices(
  dataset: ReplayDataset,
): readonly ReplaySlice[] {
  const cutoffs = [...new Set(dataset.cutoffs)]
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  return cutoffs.map((cutoff, index) => {
    const nextCutoff = cutoffs[index + 1];
    const windowEnd = nextCutoff
      ? nextCutoff
      : new Date(
          cutoff.getTime() +
            (dataset.candidateWindowDays ?? 14) * 24 * 60 * 60 * 1000,
        );
    return sliceAt(dataset, cutoff.toISOString(), windowEnd.toISOString());
  });
}

export function sliceAt(
  dataset: ReplayDataset,
  cutoff: string,
  windowEnd: string,
): ReplaySlice {
  const cutoffTime = Date.parse(cutoff);
  const endTime = Date.parse(windowEnd);
  if (!Number.isFinite(cutoffTime) || !Number.isFinite(endTime)) {
    throw new Error("Replay cutoff and window end must be valid dates");
  }
  if (endTime <= cutoffTime) {
    throw new Error("Replay window end must be after its cutoff");
  }
  const historicalPaperIDs = dataset.papers
    .filter((paper) => Date.parse(paper.publishedAt) <= cutoffTime)
    .map((paper) => paper.paperID);
  const historicalFeedback = dataset.feedback.filter(
    (event) => Date.parse(event.occurredAt) <= cutoffTime,
  );
  const candidateIDs = dataset.papers
    .filter((paper) => {
      const publishedAt = Date.parse(paper.publishedAt);
      return publishedAt > cutoffTime && publishedAt <= endTime;
    })
    .map((paper) => paper.paperID);
  const candidateSet = new Set(candidateIDs);
  const relevantPaperIDs = new Set(
    dataset.feedback
      .filter(
        (event) =>
          event.action === "saved" &&
          Date.parse(event.occurredAt) > cutoffTime &&
          Date.parse(event.occurredAt) <= endTime,
      )
      .map((event) => matchFeedbackPaper(event, dataset).paperID)
      .filter((paperID) => paperID !== undefined && candidateSet.has(paperID))
      .filter((paperID) => paperID !== undefined),
  );
  return {
    cutoff: new Date(cutoffTime).toISOString(),
    windowEnd: new Date(endTime).toISOString(),
    historicalPaperIDs,
    historicalFeedbackCount: historicalFeedback.length,
    candidateIDs,
    relevantPaperIDs: [...relevantPaperIDs].sort(),
  };
}

export function matchFeedbackPaper(
  feedback: ReplayFeedback,
  dataset: ReplayDataset,
): FeedbackMatch {
  if (feedback.paperID) {
    const direct = dataset.papers.find(
      (paper) => paper.paperID === feedback.paperID,
    );
    if (direct) return { paperID: direct.paperID, reason: "paper-id" };
  }

  const arxivID = normalizeArxivID(feedback.arxivID);
  if (arxivID) {
    const match = uniqueMatch(
      dataset.papers,
      (paper) => normalizeArxivID(paper.arxivID) === arxivID,
    );
    if (match.status === "matched") {
      return { paperID: match.paper.paperID, reason: "arxiv-id" };
    }
    if (match.status === "ambiguous") return { reason: "ambiguous" };
  }

  const doi = normalizeDoi(feedback.doi);
  if (doi) {
    const match = uniqueMatch(
      dataset.papers,
      (paper) => normalizeDoi(paper.doi) === doi,
    );
    if (match.status === "matched") {
      return { paperID: match.paper.paperID, reason: "doi" };
    }
    if (match.status === "ambiguous") return { reason: "ambiguous" };
  }

  const title = normalizeTitle(feedback.title);
  if (title && feedback.year) {
    const match = uniqueMatch(
      dataset.papers,
      (paper) =>
        normalizeTitle(paper.title) === title &&
        paperYear(paper) === feedback.year,
    );
    if (match.status === "matched") {
      return { paperID: match.paper.paperID, reason: "title-year" };
    }
    if (match.status === "ambiguous") return { reason: "ambiguous" };
  }

  const hasIdentifier = Boolean(
    feedback.paperID || arxivID || doi || (title && feedback.year),
  );
  return { reason: hasIdentifier ? "not-found" : "missing-identifiers" };
}

function uniqueMatch(
  papers: readonly ReplayPaper[],
  predicate: (paper: ReplayPaper) => boolean,
):
  | { readonly status: "matched"; readonly paper: ReplayPaper }
  | { readonly status: "ambiguous" | "not-found" } {
  const matches = papers.filter(predicate);
  if (matches.length === 1) return { status: "matched", paper: matches[0] };
  return { status: matches.length > 1 ? "ambiguous" : "not-found" };
}

function normalizeArxivID(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^arxiv:/, "")
    .replace(/v\d+$/, "");
}

function normalizeDoi(value?: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
}

function normalizeTitle(value?: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function paperYear(paper: ReplayPaper): number {
  return paper.year ?? new Date(paper.publishedAt).getUTCFullYear();
}

export function paperMap(
  dataset: ReplayDataset,
): ReadonlyMap<string, ReplayPaper> {
  return new Map(dataset.papers.map((paper) => [paper.paperID, paper]));
}

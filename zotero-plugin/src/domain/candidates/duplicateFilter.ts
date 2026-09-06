import type { ArxivCandidate } from "../model.ts";
import {
  candidateTitleYearKey,
  normalizeCandidateTitle,
  normalizeCandidateURL,
  normalizeDoi,
} from "./normalization.ts";

export type DuplicateMatchKind = "arxiv-id" | "doi" | "url" | "title-year";

export interface DuplicateRecord {
  readonly candidate: ArxivCandidate;
  readonly keptArxivId: string;
  readonly kind: DuplicateMatchKind;
}

export interface DuplicateFilterResult {
  readonly candidates: readonly ArxivCandidate[];
  readonly duplicates: readonly DuplicateRecord[];
}

export function deduplicateCandidates(
  candidates: readonly ArxivCandidate[],
): DuplicateFilterResult {
  const seen = new Map<
    string,
    { candidate: ArxivCandidate; kind: DuplicateMatchKind }
  >();
  const kept: ArxivCandidate[] = [];
  const duplicates: DuplicateRecord[] = [];
  const ordered = [...candidates].sort(compareCandidates);
  for (const candidate of ordered) {
    const keys = candidateKeys(candidate);
    const existing = keys
      .map(({ key, kind }) => {
        const match = seen.get(key);
        return match ? { ...match, kind } : undefined;
      })
      .find(Boolean);
    if (existing) {
      duplicates.push({
        candidate,
        keptArxivId: existing.candidate.arxivId,
        kind: existing.kind,
      });
      continue;
    }
    kept.push(candidate);
    for (const { key, kind } of keys) seen.set(key, { candidate, kind });
  }
  return { candidates: kept, duplicates };
}

export type SuppressionKind = "saved" | "rejected-topic" | "deferred";

export interface SuppressionRecord {
  readonly arxivId: string;
  readonly kind: SuppressionKind;
  readonly occurredAt: string;
}

export function filterSuppressedCandidates(
  candidates: readonly ArxivCandidate[],
  suppressions: readonly SuppressionRecord[],
  now: Date,
): {
  readonly candidates: readonly ArxivCandidate[];
  readonly suppressed: readonly string[];
} {
  const latest = new Map<string, SuppressionRecord>();
  for (const suppression of suppressions) {
    const current = latest.get(suppression.arxivId);
    if (!current || current.occurredAt < suppression.occurredAt) {
      latest.set(suppression.arxivId, suppression);
    }
  }
  const eligible: ArxivCandidate[] = [];
  const suppressed: string[] = [];
  for (const candidate of candidates) {
    const suppression = latest.get(candidate.arxivId);
    const age = suppression
      ? now.getTime() - new Date(suppression.occurredAt).getTime()
      : Number.POSITIVE_INFINITY;
    const isSuppressed =
      Boolean(suppression) &&
      (suppression?.kind === "saved" ||
        suppression?.kind === "rejected-topic" ||
        (suppression?.kind === "deferred" && age < 7 * 24 * 60 * 60 * 1000));
    if (isSuppressed) suppressed.push(candidate.arxivId);
    else eligible.push(candidate);
  }
  return { candidates: eligible, suppressed };
}

function candidateKeys(
  candidate: ArxivCandidate,
): readonly { key: string; kind: DuplicateMatchKind }[] {
  const keys: { key: string; kind: DuplicateMatchKind }[] = [
    { key: `arxiv:${candidate.arxivId.toLowerCase()}`, kind: "arxiv-id" },
  ];
  if (candidate.doi)
    keys.push({ key: `doi:${normalizeDoi(candidate.doi)}`, kind: "doi" });
  if (candidate.abstractUrl)
    keys.push({
      key: `url:${normalizeCandidateURL(candidate.abstractUrl)}`,
      kind: "url",
    });
  if (candidate.pdfUrl)
    keys.push({
      key: `url:${normalizeCandidateURL(candidate.pdfUrl)}`,
      kind: "url",
    });
  keys.push({
    key: `title:${candidateTitleYearKey(candidate.title, candidate.submittedAt)}`,
    kind: "title-year",
  });
  return keys;
}

function compareCandidates(
  left: ArxivCandidate,
  right: ArxivCandidate,
): number {
  return (
    Date.parse(right.updatedAt ?? right.submittedAt) -
      Date.parse(left.updatedAt ?? left.submittedAt) ||
    normalizeCandidateTitle(left.title).localeCompare(
      normalizeCandidateTitle(right.title),
    ) ||
    left.arxivId.localeCompare(right.arxivId)
  );
}

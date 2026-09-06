import type { ArxivCandidate, InterestProfile } from "../model.ts";
import { cosineSimilarity } from "../profiles/vectorMath.ts";

export interface RankingWeights {
  readonly recentSimilarity: number;
  readonly longTermSimilarity: number;
  readonly representativeSimilarity: number;
  readonly keywordMatch: number;
  readonly manualPriority: number;
  readonly negativeSimilarity: number;
}

export interface RankingCandidate {
  readonly candidate: ArxivCandidate;
  readonly vector: readonly number[];
}

export interface RepresentativeVector {
  readonly itemKey: string;
  readonly title: string;
  readonly vector: readonly number[];
}

export interface NegativeSimilaritySignal {
  readonly vector: readonly number[];
  readonly weight?: number;
  readonly occurredAt: string;
}

export interface FeatureContext {
  readonly recentProfiles: readonly InterestProfile[];
  readonly longTermProfiles: readonly InterestProfile[];
  readonly representatives?: Readonly<
    Record<string, readonly RepresentativeVector[]>
  >;
  readonly negativeSignals?: readonly NegativeSimilaritySignal[];
  readonly now?: Date;
  readonly selectedProfileIDs?: readonly string[];
}

export interface FeatureMatch {
  readonly profile?: InterestProfile;
  readonly similarity: number;
}

export interface CandidateFeatures {
  readonly recentSimilarity: number;
  readonly longTermSimilarity: number;
  readonly representativeSimilarity: number;
  readonly keywordMatch: number;
  readonly manualPriority: number;
  readonly negativeSimilarity: number;
  readonly recentMatch?: FeatureMatch;
  readonly longTermMatch?: FeatureMatch;
  readonly representativeMatches: readonly {
    readonly itemKey: string;
    readonly title: string;
    readonly similarity: number;
  }[];
  readonly matchedKeywords: readonly string[];
}

export function extractCandidateFeatures(
  input: RankingCandidate,
  context: FeatureContext,
): CandidateFeatures {
  const recentProfiles = selectedActiveProfiles(
    context.recentProfiles,
    context.selectedProfileIDs,
  );
  const longTermProfiles = selectedActiveProfiles(
    context.longTermProfiles,
    context.selectedProfileIDs,
  );
  const recentMatch = bestProfileMatch(input.vector, recentProfiles);
  const longTermMatch = bestProfileMatch(input.vector, longTermProfiles);
  const bestProfile =
    recentMatch && recentMatch.similarity >= (longTermMatch?.similarity ?? -1)
      ? recentMatch.profile
      : longTermMatch?.profile;
  const representativeVectors = bestProfile
    ? (context.representatives?.[bestProfile.id] ?? [])
    : [];
  const representativeMatches = representativeVectors
    .map((representative) => ({
      itemKey: representative.itemKey,
      title: representative.title,
      similarity: positiveCosine(input.vector, representative.vector),
    }))
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        left.itemKey.localeCompare(right.itemKey),
    )
    .slice(0, 3);
  const matchedKeywords = bestProfile
    ? keywordHits(input.candidate, bestProfile.keywords)
    : [];
  const negativeSimilarity = (context.negativeSignals ?? []).reduce(
    (total, signal) =>
      total +
      positiveCosine(input.vector, signal.vector) *
        Math.max(0, signal.weight ?? 1) *
        recencyDecay(signal.occurredAt, context.now ?? new Date()),
    0,
  );
  return {
    recentSimilarity: recentMatch?.similarity ?? 0,
    longTermSimilarity: longTermMatch?.similarity ?? 0,
    representativeSimilarity: averageTopSimilarity(representativeMatches),
    keywordMatch: bestProfile
      ? matchedKeywords.length / Math.max(bestProfile.keywords.length, 1)
      : 0,
    manualPriority: bestProfile ? manualPriority(bestProfile) : 0,
    negativeSimilarity: Math.min(1, negativeSimilarity),
    recentMatch,
    longTermMatch,
    representativeMatches,
    matchedKeywords,
  };
}

export function profileSimilarity(
  vector: readonly number[],
  profile: InterestProfile,
): number {
  return positiveCosine(vector, profile.centroid);
}

function selectedActiveProfiles(
  profiles: readonly InterestProfile[],
  selectedProfileIDs?: readonly string[],
): InterestProfile[] {
  const selected = selectedProfileIDs ? new Set(selectedProfileIDs) : undefined;
  return profiles.filter(
    (profile) =>
      !profile.disabled &&
      (!selected ||
        selected.has(profile.id) ||
        selected.has(profile.lineageId)),
  );
}

function bestProfileMatch(
  vector: readonly number[],
  profiles: readonly InterestProfile[],
): FeatureMatch | undefined {
  let best: FeatureMatch | undefined;
  for (const profile of profiles) {
    const similarity = profileSimilarity(vector, profile);
    if (
      !best ||
      similarity > best.similarity ||
      (similarity === best.similarity && profile.id < (best.profile?.id ?? ""))
    ) {
      best = { profile, similarity };
    }
  }
  return best;
}

function positiveCosine(
  left: readonly number[],
  right: readonly number[],
): number {
  return Math.max(0, Math.min(1, cosineSimilarity(left, right)));
}

function averageTopSimilarity(
  matches: readonly { readonly similarity: number }[],
): number {
  if (!matches.length) return 0;
  return (
    matches.reduce((total, match) => total + match.similarity, 0) /
    matches.length
  );
}

function keywordHits(
  candidate: ArxivCandidate,
  keywords: readonly string[],
): string[] {
  const text = `${candidate.title} ${candidate.abstract}`.toLocaleLowerCase();
  return keywords.filter((keyword) => {
    const normalized = keyword.trim().toLocaleLowerCase();
    return normalized.length > 1 && text.includes(normalized);
  });
}

function manualPriority(profile: InterestProfile): number {
  const weightBoost = Math.max(0, Math.min(1, (profile.weight - 1) / 1));
  return Math.min(1, weightBoost + (profile.locked ? 0.25 : 0));
}

function recencyDecay(occurredAt: string, now: Date): number {
  const ageDays = Math.max(
    0,
    (now.getTime() - Date.parse(occurredAt)) / (24 * 60 * 60 * 1000),
  );
  return 2 ** (-ageDays / 30);
}

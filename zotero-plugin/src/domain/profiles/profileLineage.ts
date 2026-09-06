import { stableJsonHash } from "../../shared/stableHash.ts";
import { jaccard } from "./profileMetrics.ts";
import { cosineSimilarity } from "./vectorMath.ts";

export interface PreviousLineageProfile {
  readonly profileID: string;
  readonly lineageID: string;
  readonly profileType: string;
  readonly memberIDs: readonly string[];
  readonly centroid: readonly number[];
  readonly lockedUserName?: string;
}

export interface NewLineageProfile {
  readonly profileID: string;
  readonly profileType: string;
  readonly memberIDs: readonly string[];
  readonly centroid: readonly number[];
}

export interface LineageMatch {
  readonly profileID: string;
  readonly lineageID: string;
  readonly matched: boolean;
  readonly score: number;
  readonly threshold: number;
  readonly lockedUserName?: string;
}

const LINEAGE_THRESHOLD = 0.6;

export function lineageSimilarity(
  previous: Pick<PreviousLineageProfile, "memberIDs" | "centroid">,
  current: Pick<NewLineageProfile, "memberIDs" | "centroid">,
): number {
  return (
    0.7 * jaccard(previous.memberIDs, current.memberIDs) +
    0.3 * cosineSimilarity(previous.centroid, current.centroid)
  );
}

export function matchProfileLineages(
  previous: readonly PreviousLineageProfile[],
  current: readonly NewLineageProfile[],
): readonly LineageMatch[] {
  const candidates = previous.flatMap((oldProfile) =>
    current
      .filter((newProfile) => newProfile.profileType === oldProfile.profileType)
      .map((newProfile) => ({
        oldProfile,
        newProfile,
        score: lineageSimilarity(oldProfile, newProfile),
      })),
  );
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.oldProfile.lineageID.localeCompare(right.oldProfile.lineageID) ||
      left.newProfile.profileID.localeCompare(right.newProfile.profileID),
  );
  const matchedOld = new Set<string>();
  const matchedNew = new Set<string>();
  const matches = new Map<string, LineageMatch>();
  for (const candidate of candidates) {
    if (
      candidate.score < LINEAGE_THRESHOLD ||
      matchedOld.has(candidate.oldProfile.lineageID) ||
      matchedNew.has(candidate.newProfile.profileID)
    ) {
      continue;
    }
    matchedOld.add(candidate.oldProfile.lineageID);
    matchedNew.add(candidate.newProfile.profileID);
    matches.set(candidate.newProfile.profileID, {
      profileID: candidate.newProfile.profileID,
      lineageID: candidate.oldProfile.lineageID,
      matched: true,
      score: candidate.score,
      threshold: LINEAGE_THRESHOLD,
      lockedUserName: candidate.oldProfile.lockedUserName,
    });
  }
  return current.map((profile) => {
    const matched = matches.get(profile.profileID);
    if (matched) return matched;
    return {
      profileID: profile.profileID,
      lineageID: `lineage-${stableJsonHash({
        profileType: profile.profileType,
        memberIDs: [...profile.memberIDs].sort(),
        centroid: profile.centroid,
      })}`,
      matched: false,
      score: 0,
      threshold: LINEAGE_THRESHOLD,
    };
  });
}

export function resolveProfilePresentation(input: {
  readonly systemName: string;
  readonly systemKeywords: readonly string[];
  readonly overlay?: {
    readonly userName?: string;
    readonly keywords?: readonly string[];
    readonly locked?: boolean;
  };
}): {
  readonly displayName: string;
  readonly displayKeywords: readonly string[];
  readonly systemName: string;
  readonly systemKeywords: readonly string[];
} {
  return {
    displayName: input.overlay?.userName?.trim() || input.systemName,
    displayKeywords:
      input.overlay?.keywords?.length && input.overlay.locked
        ? input.overlay.keywords
        : input.systemKeywords,
    systemName: input.systemName,
    systemKeywords: input.systemKeywords,
  };
}

import type { InterestProfile, ZoteroPaper } from "../model.ts";
import { stableJsonHash } from "../../shared/stableHash.ts";
import { clusterProfiles, type ProfileVector } from "./profileClustering.ts";
import { computeProfileMetrics } from "./profileMetrics.ts";
import { nameProfile } from "./profileNaming.ts";
import {
  buildRecentInterestSet,
  RECENT_HALF_LIFE_DAYS,
  RECENT_WINDOW_DAYS,
  recencyWeight,
} from "./recentInterest.ts";
import { cosineSimilarity } from "./vectorMath.ts";
import { matchProfileLineages } from "./profileLineage.ts";

export interface ProfileAlgorithmConfig {
  readonly seed: number;
  readonly recentWindowDays: number;
  readonly recentHalfLifeDays: number;
  readonly clusterImprovementThreshold: number;
  readonly maxSampleSize: number;
}

export interface BuiltProfile extends InterestProfile {
  readonly memberItemKeys: readonly string[];
  readonly memberSimilarities: Readonly<Record<string, number>>;
  readonly metrics: ReturnType<typeof computeProfileMetrics>;
}

export interface ProfileBuildResult {
  readonly versionId: string;
  readonly createdAt: string;
  readonly corpusFingerprint: string;
  readonly creationReason: string;
  readonly algorithmConfig: ProfileAlgorithmConfig;
  readonly profiles: readonly BuiltProfile[];
}

interface ProfileBuilderOptions {
  readonly seed: number;
  readonly now?: () => Date;
}

export class ProfileBuilder {
  private readonly seed: number;
  private readonly now: () => Date;

  constructor(options: ProfileBuilderOptions) {
    this.seed = options.seed;
    this.now = options.now ?? (() => new Date());
  }

  build(input: {
    readonly papers: readonly ZoteroPaper[];
    readonly vectors: ReadonlyMap<string, readonly number[]>;
    readonly reason: string;
    readonly corpusFingerprint?: string;
    readonly feedbackActions?: ReadonlyMap<string, string>;
    readonly previousProfiles?: readonly PreviousProfile[];
  }): ProfileBuildResult {
    const createdAt = this.now().toISOString();
    const versionId = `profiles-${stableJsonHash({ createdAt, reason: input.reason })}`;
    const papersByKey = new Map(
      input.papers.map((paper) => [paper.itemKey, paper]),
    );
    const recentPapers = buildRecentInterestSet(
      input.papers,
      this.now(),
      input.feedbackActions,
    );
    const algorithmConfig: ProfileAlgorithmConfig = {
      seed: this.seed,
      recentWindowDays: RECENT_WINDOW_DAYS,
      recentHalfLifeDays: RECENT_HALF_LIFE_DAYS,
      clusterImprovementThreshold: 0.08,
      maxSampleSize: 1_000,
    };
    const profiles = [
      ...this.buildHorizon(
        "long-term",
        input.papers,
        input.vectors,
        papersByKey,
        versionId,
        input.previousProfiles,
      ),
      ...this.buildHorizon(
        "recent",
        recentPapers,
        input.vectors,
        papersByKey,
        versionId,
        input.previousProfiles,
      ),
    ];
    return {
      versionId,
      createdAt,
      corpusFingerprint:
        input.corpusFingerprint ??
        stableJsonHash(input.papers.map(({ itemKey }) => itemKey).sort()),
      creationReason: input.reason,
      algorithmConfig,
      profiles,
    };
  }

  private buildHorizon(
    horizon: "recent" | "long-term",
    papers: readonly ZoteroPaper[],
    vectors: ReadonlyMap<string, readonly number[]>,
    papersByKey: ReadonlyMap<string, ZoteroPaper>,
    versionId: string,
    previousProfiles?: readonly PreviousProfile[],
  ): readonly BuiltProfile[] {
    const values: ProfileVector[] = papers.flatMap((paper) => {
      const vector = vectors.get(paper.itemKey);
      return vector ? [{ id: paper.itemKey, vector }] : [];
    });
    if (values.length === 0) return [];
    const clustering = clusterProfiles(values, { seed: this.seed });
    const provisionalProfiles = clustering.clusters.map((cluster) => ({
      profileID: `${horizon}-${stableJsonHash([...cluster.memberIDs].sort())}`,
      profileType: horizon,
      memberIDs: [...cluster.memberIDs].sort(),
      centroid: cluster.centroid,
    }));
    const previous = (previousProfiles ?? [])
      .filter((profile) => profile.horizon === horizon)
      .map((profile) => ({
        profileID: profile.id,
        lineageID: profile.lineageId,
        profileType: profile.horizon,
        memberIDs: profile.memberItemKeys ?? profile.representativeItemKeys,
        centroid: profile.centroid,
        ...(profile.locked && profile.name
          ? { lockedUserName: profile.name }
          : {}),
      }));
    const lineages = new Map(
      matchProfileLineages(previous, provisionalProfiles).map((match) => [
        match.profileID,
        match,
      ]),
    );
    return clustering.clusters.map((cluster, index): BuiltProfile => {
      const memberItemKeys = [...cluster.memberIDs].sort();
      const members = memberItemKeys.map((itemKey) => ({
        paper: papersByKey.get(itemKey)!,
        vector: vectors.get(itemKey)!,
      }));
      const naming = nameProfile(members, cluster.centroid);
      const lineageMatch = lineages.get(provisionalProfiles[index].profileID);
      const lineageId =
        lineageMatch?.lineageID ??
        `lineage-${stableJsonHash({ horizon, memberItemKeys })}`;
      const previousForMetrics = previousProfiles?.find(
        (profile) => profile.lineageId === lineageMatch?.lineageID,
      );
      const metrics = computeProfileMetrics({
        centroid: cluster.centroid,
        members: members.map(({ paper, vector }) => ({
          id: paper.itemKey,
          vector,
          collectionKeys: paper.collectionKeys,
        })),
        previousMemberIDs:
          previousForMetrics?.memberItemKeys ??
          previousForMetrics?.representativeItemKeys,
      });
      const memberSimilarities = Object.fromEntries(
        members.map(({ paper, vector }) => [
          paper.itemKey,
          cosineSimilarity(vector, cluster.centroid),
        ]),
      );
      const weight =
        horizon === "recent"
          ? members.reduce(
              (sum, { paper }) =>
                sum + recencyWeight(ageInDays(paper.dateAdded, this.now())),
              0,
            ) / members.length
          : 1;
      return {
        id: `${lineageId}-${versionId}`,
        lineageId,
        versionId,
        horizon,
        name: lineageMatch?.lockedUserName ?? naming.systemName,
        keywords: naming.keywords,
        centroid: cluster.centroid,
        representativeItemKeys: naming.representativeItemKeys,
        memberCount: memberItemKeys.length,
        weight,
        locked: Boolean(lineageMatch?.lockedUserName),
        disabled: false,
        memberItemKeys,
        memberSimilarities,
        metrics,
      };
    });
  }
}

type PreviousProfile = InterestProfile & {
  readonly memberItemKeys?: readonly string[];
};

export interface ProfileRebuildDecision {
  readonly fullRebuild: boolean;
  readonly reasons: readonly string[];
}

export function shouldRebuildProfiles(input: {
  readonly lastBuiltAt?: string;
  readonly previousCorpusCount: number;
  readonly currentCorpusCount: number;
  readonly previousMemberCount: number;
  readonly currentMemberCount: number;
  readonly previousCentroid: readonly number[];
  readonly currentCentroid: readonly number[];
  readonly now?: string;
}): ProfileRebuildDecision {
  const reasons: string[] = [];
  const corpusChange = relativeChange(
    input.previousCorpusCount,
    input.currentCorpusCount,
  );
  if (corpusChange > 0.1) reasons.push("corpus-change-over-10-percent");
  if (
    input.lastBuiltAt &&
    (new Date(input.now ?? new Date().toISOString()).getTime() -
      new Date(input.lastBuiltAt).getTime()) /
      86_400_000 >
      30
  ) {
    reasons.push("full-rebuild-older-than-30-days");
  }
  if (
    relativeChange(input.previousMemberCount, input.currentMemberCount) > 0.2
  ) {
    reasons.push("member-change-over-20-percent");
  }
  if (
    1 - cosineSimilarity(input.previousCentroid, input.currentCentroid) >
    0.15
  ) {
    reasons.push("centroid-distance-over-0.15");
  }
  return { fullRebuild: reasons.length > 0, reasons };
}

function relativeChange(previous: number, current: number): number {
  if (previous === 0) return current === 0 ? 0 : 1;
  return Math.abs(current - previous) / previous;
}

function ageInDays(value: string, now: Date): number {
  return (now.getTime() - new Date(value).getTime()) / 86_400_000;
}

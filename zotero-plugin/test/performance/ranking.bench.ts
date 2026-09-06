import { scoreCandidates } from "../../src/domain/ranking/relevanceScorer.ts";
import type {
  ArxivCandidate,
  InterestProfile,
} from "../../src/domain/model.ts";

export interface PerformanceMeasurement {
  readonly name: string;
  readonly elapsedMs: number;
  readonly thresholdMs: number;
  readonly sampleSize: number;
  readonly profileCount: number;
  readonly passed: boolean;
}

export function benchmarkRanking(): PerformanceMeasurement {
  const profiles = Array.from({ length: 12 }, (_, index) =>
    createProfile(index),
  );
  const inputs = Array.from({ length: 1_000 }, (_, index) => ({
    candidate: createCandidate(index),
    vector: vectorFor(index),
  }));
  const started = performance.now();
  const ranked = scoreCandidates(inputs, {
    recentProfiles: profiles,
    longTermProfiles: profiles,
  });
  const elapsedMs = performance.now() - started;
  if (ranked.length !== inputs.length) {
    throw new Error("Ranking benchmark did not return every candidate");
  }
  return {
    name: "local ranking: 1,000 candidates x 12 profiles",
    elapsedMs,
    thresholdMs: 2_000,
    sampleSize: inputs.length,
    profileCount: profiles.length,
    passed: elapsedMs < 2_000,
  };
}

function createProfile(index: number): InterestProfile {
  return {
    id: `profile-${index}`,
    lineageId: `lineage-${index}`,
    versionId: `version-${index}`,
    horizon: index % 2 ? "long-term" : "recent",
    name: `Profile ${index}`,
    keywords: [`keyword-${index}`],
    centroid: vectorFor(index),
    representativeItemKeys: [],
    memberCount: 10,
    weight: 1,
    locked: false,
    disabled: false,
  };
}

function createCandidate(index: number): ArxivCandidate {
  const id = `2608.${String(index + 1).padStart(5, "0")}`;
  return {
    arxivId: id,
    version: 1,
    title: `Benchmark paper ${index}`,
    abstract: `Abstract for benchmark paper ${index}`,
    authors: [],
    categories: ["cs.CV"],
    submittedAt: "2026-08-26T00:00:00.000Z",
    abstractUrl: `https://arxiv.org/abs/${id}`,
    pdfUrl: `https://arxiv.org/pdf/${id}.pdf`,
  };
}

function vectorFor(index: number): number[] {
  const vector = new Array<number>(32).fill(0);
  vector[index % vector.length] = 1;
  vector[(index * 7 + 3) % vector.length] += 0.25;
  return vector;
}

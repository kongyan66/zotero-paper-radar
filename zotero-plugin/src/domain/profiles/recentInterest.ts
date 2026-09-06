import type { ZoteroPaper } from "../model.ts";
import { normalizeVector } from "./vectorMath.ts";

export const RECENT_WINDOW_DAYS = 90;
export const RECENT_HALF_LIFE_DAYS = 30;

export function recencyWeight(
  ageDays: number,
  halfLifeDays = RECENT_HALF_LIFE_DAYS,
): number {
  if (ageDays > RECENT_WINDOW_DAYS) return 0;
  if (ageDays <= 0) return 1;
  return 2 ** (-ageDays / halfLifeDays);
}

export function buildRecentInterestSet(
  papers: readonly ZoteroPaper[],
  now: Date,
  feedbackActions: ReadonlyMap<string, string> = new Map(),
): readonly ZoteroPaper[] {
  return papers.filter((paper) => {
    const action = feedbackActions.get(paper.itemKey);
    if (action === "deferred" || action === "rejected-topic") return false;
    if (action === "saved") return true;
    return recencyWeight(ageInDays(paper.dateAdded, now)) > 0;
  });
}

export function weightedCentroid(
  values: readonly { vector: readonly number[]; weight: number }[],
): number[] {
  if (values.length === 0)
    throw new Error("Cannot build a centroid without vectors");
  const dimensions = values[0].vector.length;
  const result = new Array<number>(dimensions).fill(0);
  let totalWeight = 0;
  for (const value of values) {
    if (value.vector.length !== dimensions || value.weight < 0) {
      throw new Error(
        "Recent interest vectors have invalid dimensions or weight",
      );
    }
    value.vector.forEach((component, index) => {
      result[index] += component * value.weight;
    });
    totalWeight += value.weight;
  }
  if (totalWeight === 0) return normalizeVector(result);
  return normalizeVector(result.map((value) => value / totalWeight));
}

function ageInDays(value: string, now: Date): number {
  return (now.getTime() - new Date(value).getTime()) / 86_400_000;
}

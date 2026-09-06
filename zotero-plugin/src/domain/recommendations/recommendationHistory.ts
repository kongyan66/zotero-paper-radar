import type { ArxivCandidate } from "../model.ts";

export const RECOMMENDATION_HISTORY_DAYS = 7;

export interface RecommendationHistoryDay {
  readonly dayKey: string;
  readonly label: string;
  readonly candidateCount: number;
  readonly runID: string;
  readonly createdAt: string;
}

export function localDayKey(value: Date | string): string | undefined {
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, "0"),
    )
    .join("-");
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function recommendationHistoryStart(
  now: Date,
  days = RECOMMENDATION_HISTORY_DAYS,
): Date {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("推荐历史窗口必须是正整数天数");
  }
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

export function filterUnseenCandidates(
  candidates: readonly ArxivCandidate[],
  previouslyRecommended: ReadonlySet<string>,
): readonly ArxivCandidate[] {
  return candidates.filter(
    (candidate) => !previouslyRecommended.has(candidate.arxivId),
  );
}

export function formatHistoryDayLabel(dayKey: string, now: Date): string {
  const today = localDayKey(now);
  const yesterdayDate = startOfLocalDay(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDayKey(yesterdayDate);
  if (dayKey === today) return `今天 · ${dayKey}`;
  if (dayKey === yesterday) return `昨天 · ${dayKey}`;
  return dayKey;
}

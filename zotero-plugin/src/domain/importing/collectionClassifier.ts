export interface CollectionEvidence {
  readonly collectionKey: string;
  readonly similarity: number;
  readonly isRepresentative?: boolean;
  readonly occurredAt?: string;
  readonly userCorrection?: boolean;
}

export interface CollectionSuggestion {
  readonly collectionKey?: string;
  readonly confidence: number;
  readonly lead: number;
  readonly status: "suggested" | "待分类";
  readonly votes: readonly {
    readonly collectionKey: string;
    readonly weight: number;
    readonly share: number;
  }[];
}

export function suggestCollection(
  evidence: readonly CollectionEvidence[],
  now = new Date(),
): CollectionSuggestion {
  const votes = new Map<string, number>();
  for (const item of evidence) {
    const base = Math.max(0, item.similarity);
    const representativeBoost = item.isRepresentative ? 2 : 1;
    const correctionBoost = item.userCorrection
      ? recencyDecay(item.occurredAt, now)
      : 1;
    votes.set(
      item.collectionKey,
      (votes.get(item.collectionKey) ?? 0) +
        base * representativeBoost * correctionBoost,
    );
  }
  const sorted = [...votes.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );
  const total = sorted.reduce((sum, [, weight]) => sum + weight, 0);
  const top = sorted[0];
  const second = sorted[1]?.[1] ?? 0;
  const confidence = top && total > 0 ? top[1] / total : 0;
  const lead = top && total > 0 ? (top[1] - second) / total : 0;
  const status = confidence >= 0.55 && lead >= 0.15 ? "suggested" : "待分类";
  return {
    ...(status === "suggested" && top ? { collectionKey: top[0] } : {}),
    confidence,
    lead,
    status,
    votes: sorted.map(([collectionKey, weight]) => ({
      collectionKey,
      weight,
      share: total ? weight / total : 0,
    })),
  };
}

function recencyDecay(occurredAt: string | undefined, now: Date): number {
  if (!occurredAt) return 1;
  const ageDays = Math.max(
    0,
    (now.getTime() - Date.parse(occurredAt)) / (24 * 60 * 60 * 1000),
  );
  return 2 ** (-ageDays / 180);
}

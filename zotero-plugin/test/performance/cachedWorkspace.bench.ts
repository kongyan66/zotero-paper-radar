import type { PerformanceMeasurement } from "./ranking.bench.ts";

interface CachedWorkspaceRow {
  readonly paperID: string;
  readonly title: string;
  readonly score: number;
  readonly explanation: readonly string[];
}

export function benchmarkCachedWorkspace(): PerformanceMeasurement {
  const cachedRows = Array.from({ length: 50 }, (_, index) => ({
    paperID: `paper-${index}`,
    title: `Cached recommendation ${index}`,
    score: 0.95 - index / 1_000,
    explanation: ["近期兴趣", "代表论文", "关键词命中"],
  }));
  const started = performance.now();
  const firstScreen = buildFirstScreen(cachedRows);
  const elapsedMs = performance.now() - started;
  if (firstScreen.length !== 20) {
    throw new Error("Cached workspace benchmark did not build first screen");
  }
  return {
    name: "cached workspace view-model first screen",
    elapsedMs,
    thresholdMs: 1_000,
    sampleSize: cachedRows.length,
    profileCount: 12,
    passed: elapsedMs < 1_000,
  };
}

function buildFirstScreen(rows: readonly CachedWorkspaceRow[]): string[] {
  return rows.slice(0, 20).map((row) => {
    const explanation = row.explanation.join(" / ");
    return `${row.paperID}|${row.title}|${row.score.toFixed(4)}|${explanation}`;
  });
}

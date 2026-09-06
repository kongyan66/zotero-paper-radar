export function displayScoreFromDistribution(
  score: number,
  distribution: readonly number[],
): number {
  if (
    !distribution.length ||
    distribution.every((value) => value === distribution[0])
  )
    return 50;
  const sorted = [...distribution].sort((left, right) => left - right);
  const low = percentile(sorted, 0.05);
  const high = percentile(sorted, 0.95);
  if (high <= low) return 50;
  return Math.round(
    100 * Math.min(1, Math.max(0, (score - low) / (high - low))),
  );
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  const index = (values.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

export function dotProduct(
  left: readonly number[],
  right: readonly number[],
): number {
  assertSameDimensions(left, right);
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

export function magnitude(vector: readonly number[]): number {
  return Math.sqrt(dotProduct(vector, vector));
}

export function normalizeVector(vector: readonly number[]): number[] {
  const length = magnitude(vector);
  if (!Number.isFinite(length) || length === 0) {
    throw new Error("Cannot normalize an empty or zero vector");
  }
  return vector.map((value) => value / length);
}

export function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  const denominator = magnitude(left) * magnitude(right);
  if (denominator === 0) return 0;
  return dotProduct(left, right) / denominator;
}

export function squaredEuclideanDistance(
  left: readonly number[],
  right: readonly number[],
): number {
  assertSameDimensions(left, right);
  return left.reduce((sum, value, index) => {
    const difference = value - right[index];
    return sum + difference * difference;
  }, 0);
}

export function meanVector(vectors: readonly (readonly number[])[]): number[] {
  if (vectors.length === 0) throw new Error("Cannot average zero vectors");
  const dimensions = vectors[0].length;
  const result = new Array<number>(dimensions).fill(0);
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error("Vector dimensions must match");
    }
    vector.forEach((value, index) => {
      result[index] += value;
    });
  }
  return result.map((value) => value / vectors.length);
}

function assertSameDimensions(
  left: readonly number[],
  right: readonly number[],
): void {
  if (left.length === 0 || left.length !== right.length) {
    throw new Error("Vector dimensions must match and be non-empty");
  }
}

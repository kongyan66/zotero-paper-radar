import { stableHash, stableJsonHash } from "../../shared/stableHash.ts";
import type { ModelProvider } from "../../shared/modelProvider.ts";

export interface ModelFingerprintInput {
  readonly provider?: ModelProvider;
  readonly baseURL: string;
  readonly model: string;
  readonly dimensions: number;
  readonly normalizationVersion: string;
}

export interface ModelFingerprint {
  readonly generationID: string;
  readonly provider: ModelProvider;
  readonly baseURLHash: string;
  readonly normalizedBaseURL: string;
  readonly model: string;
  readonly dimensions: number;
  readonly normalizationVersion: string;
}

export function createModelFingerprint(
  input: ModelFingerprintInput,
): ModelFingerprint {
  const url = new URL(input.baseURL.trim());
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");
  const normalizedBaseURL = url.href.replace(/\/$/, "");
  const model = input.model.trim();
  const provider = input.provider ?? "openai-compatible";
  const normalizationVersion = input.normalizationVersion.trim();
  const dimensions = Math.round(input.dimensions);
  if (!model || !normalizationVersion || dimensions <= 0) {
    throw new Error("Model fingerprint settings are incomplete");
  }
  const identity = {
    provider,
    baseURL: normalizedBaseURL,
    model,
    dimensions,
    normalizationVersion,
  };
  return {
    generationID: `emb-${stableJsonHash(identity)}`,
    provider,
    baseURLHash: stableHash(normalizedBaseURL),
    normalizedBaseURL,
    model,
    dimensions,
    normalizationVersion,
  };
}

export function createEmbeddingContentHash(input: {
  readonly itemVersion: number;
  readonly title: string;
  readonly abstract: string;
}): string {
  return stableJsonHash({
    itemVersion: input.itemVersion,
    title: normalizeText(input.title),
    abstract: normalizeText(input.abstract),
  });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

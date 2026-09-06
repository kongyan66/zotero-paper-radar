import { config } from "../../../package.json";
import {
  normalizeModelProvider,
  type ModelProvider,
} from "../models/modelProvider.ts";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

export const DEFAULT_ARXIV_CATEGORIES = ["cs.CV", "cs.CL"] as const;

export interface ModelSettings {
  readonly embeddingProvider: ModelProvider;
  readonly embeddingBaseURL: string;
  readonly embeddingAPIKey: string;
  readonly embeddingModel: string;
  readonly embeddingDimensions?: number;
  readonly embeddingBatchSize: number;
  readonly allowInsecureLocalhost: boolean;
  readonly llmEnabled: boolean;
  readonly llmProvider: ModelProvider;
  readonly llmBaseURL: string;
  readonly llmAPIKey: string;
  readonly llmModel: string;
  readonly networkTimeoutMs: number;
}

const MODEL_SETTING_KEYS = [
  "embeddingProvider",
  "embeddingBaseURL",
  "embeddingAPIKey",
  "embeddingModel",
  "embeddingBatchSize",
  "allowInsecureLocalhost",
  "llmEnabled",
  "llmProvider",
  "llmBaseURL",
  "llmAPIKey",
  "llmModel",
  "networkTimeoutMs",
] as const satisfies readonly (keyof ModelSettings)[];

export class PreferencesRepository {
  get<K extends keyof PluginPrefsMap>(key: K): PluginPrefsMap[K] {
    return Zotero.Prefs.get(prefName(key), true) as PluginPrefsMap[K];
  }

  set<K extends keyof PluginPrefsMap>(key: K, value: PluginPrefsMap[K]): void {
    Zotero.Prefs.set(prefName(key), value, true);
  }

  getModelSettings(): ModelSettings {
    return {
      embeddingProvider: normalizeModelProvider(this.get("embeddingProvider")),
      embeddingBaseURL: String(this.get("embeddingBaseURL")),
      embeddingAPIKey: String(this.get("embeddingAPIKey")),
      embeddingModel: String(this.get("embeddingModel")),
      embeddingDimensions: clampInteger(
        Number(this.get("embeddingDimensions")),
        0,
        100_000,
      ),
      embeddingBatchSize: clampInteger(
        Number(this.get("embeddingBatchSize")),
        1,
        256,
      ),
      allowInsecureLocalhost: Boolean(this.get("allowInsecureLocalhost")),
      llmEnabled: Boolean(this.get("llmEnabled")),
      llmProvider: normalizeModelProvider(this.get("llmProvider")),
      llmBaseURL: String(this.get("llmBaseURL")),
      llmAPIKey: String(this.get("llmAPIKey")),
      llmModel: String(this.get("llmModel")),
      networkTimeoutMs: clampInteger(
        Number(this.get("networkTimeoutMs")),
        1_000,
        120_000,
      ),
    };
  }

  saveModelSettings(settings: ModelSettings): void {
    for (const key of MODEL_SETTING_KEYS) {
      this.set(key, settings[key] as never);
    }
  }

  getArxivCategories(): readonly string[] {
    const categories = normalizeCategories(String(this.get("arxivCategories")));
    return categories.length ? categories : DEFAULT_ARXIV_CATEGORIES;
  }

  saveArxivCategories(value: string): void {
    const categories = normalizeCategories(value);
    this.set(
      "arxivCategories",
      (categories.length ? categories : DEFAULT_ARXIV_CATEGORIES).join(","),
    );
  }
}

function prefName(key: keyof PluginPrefsMap): string {
  return `${config.prefsPrefix}.${key}`;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeCategories(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;+]+/)
        .map((category) => category.trim())
        .filter((category) => /^[a-zA-Z0-9.-]+$/.test(category)),
    ),
  ];
}

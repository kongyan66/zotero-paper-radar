import type { FeedbackReplayMetrics } from "../../domain/feedback/feedbackReplayEvaluator.ts";
import { assertValidWeights } from "../../domain/feedback/weightConstraints.ts";
import type { RankingWeights } from "../../domain/ranking/features.ts";
import { stableJsonHash } from "../../shared/stableHash.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export interface RankingWeightVersionRecord {
  readonly weightVersionID: string;
  readonly weights: RankingWeights;
  readonly trainingSampleCount: number;
  readonly updateReason: string;
  readonly rollbackOfVersionID?: string;
  readonly parentVersionID?: string;
  readonly metrics: Readonly<Record<string, unknown>>;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export class RankingWeightRepository {
  readonly #database: PluginDatabase;

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async ensureDefault(
    defaults: RankingWeights,
    now = new Date().toISOString(),
  ): Promise<RankingWeightVersionRecord> {
    const active = await this.getActive();
    if (active) return active;
    const weightVersionID = "weights-default-v1";
    assertValidWeights(defaults);
    await this.connection().executeTransaction(async () => {
      await this.connection().queryAsync(
        `INSERT OR IGNORE INTO ranking_weight_versions (
          weight_version_id, weights_json, training_sample_count, update_reason,
          rollback_of_version_id, parent_version_id, metrics_json, is_active, created_at
        ) VALUES (?, ?, 0, '默认解释排序权重', NULL, NULL, '{}', 1, ?)`,
        [weightVersionID, JSON.stringify(defaults), now],
      );
      await this.connection().queryAsync(
        "UPDATE ranking_weight_versions SET is_active = 0 WHERE weight_version_id <> ?",
        weightVersionID,
      );
      await this.connection().queryAsync(
        "UPDATE ranking_weight_versions SET is_active = 1 WHERE weight_version_id = ?",
        weightVersionID,
      );
    });
    const result = await this.get(weightVersionID);
    if (!result) throw new Error("无法初始化默认排序权重");
    return result;
  }

  async getActive(): Promise<RankingWeightVersionRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM ranking_weight_versions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1",
    )) as RankingWeightRow | false;
    return row ? decode(row) : undefined;
  }

  async get(
    weightVersionID: string,
  ): Promise<RankingWeightVersionRecord | undefined> {
    const row = (await this.connection().rowQueryAsync(
      "SELECT * FROM ranking_weight_versions WHERE weight_version_id = ?",
      weightVersionID,
    )) as RankingWeightRow | false;
    return row ? decode(row) : undefined;
  }

  async list(): Promise<readonly RankingWeightVersionRecord[]> {
    const rows = (await this.connection().queryAsync(
      "SELECT * FROM ranking_weight_versions ORDER BY created_at DESC",
    )) as RankingWeightRow[] | undefined;
    return (rows ?? []).map(decode);
  }

  async saveCandidate(input: {
    readonly weightVersionID?: string;
    readonly weights: RankingWeights;
    readonly trainingSampleCount: number;
    readonly updateReason: string;
    readonly metrics?:
      | FeedbackReplayMetrics
      | Readonly<Record<string, unknown>>;
    readonly parentVersionID?: string;
    readonly rollbackOfVersionID?: string;
    readonly now?: string;
  }): Promise<RankingWeightVersionRecord> {
    assertValidWeights(input.weights);
    const now = input.now ?? new Date().toISOString();
    const weightVersionID =
      input.weightVersionID ??
      `weights-${stableJsonHash({ weights: input.weights, sampleCount: input.trainingSampleCount, now })}`;
    await this.connection().queryAsync(
      `INSERT OR IGNORE INTO ranking_weight_versions (
        weight_version_id, weights_json, training_sample_count, update_reason,
        rollback_of_version_id, parent_version_id, metrics_json, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        weightVersionID,
        JSON.stringify(input.weights),
        Math.max(0, Math.floor(input.trainingSampleCount)),
        input.updateReason,
        input.rollbackOfVersionID ?? null,
        input.parentVersionID ?? null,
        JSON.stringify(input.metrics ?? {}),
        now,
      ],
    );
    const result = await this.get(weightVersionID);
    if (!result) throw new Error("无法保存候选排序权重");
    return result;
  }

  async publish(weightVersionID: string): Promise<RankingWeightVersionRecord> {
    await this.connection().executeTransaction(async () => {
      const candidate = await this.get(weightVersionID);
      if (!candidate) throw new Error(`未知排序权重版本 ${weightVersionID}`);
      await this.connection().queryAsync(
        "UPDATE ranking_weight_versions SET is_active = 0",
      );
      await this.connection().queryAsync(
        "UPDATE ranking_weight_versions SET is_active = 1 WHERE weight_version_id = ?",
        weightVersionID,
      );
    });
    const result = await this.get(weightVersionID);
    if (!result) throw new Error(`无法发布排序权重版本 ${weightVersionID}`);
    return result;
  }

  async rollback(
    targetVersionID: string,
    now = new Date().toISOString(),
  ): Promise<RankingWeightVersionRecord> {
    const target = await this.get(targetVersionID);
    if (!target) throw new Error(`未知排序权重版本 ${targetVersionID}`);
    const active = await this.getActive();
    const rollback = await this.saveCandidate({
      weightVersionID: `weights-rollback-${stableJsonHash({ targetVersionID, now })}`,
      weights: target.weights,
      trainingSampleCount: target.trainingSampleCount,
      updateReason: `回滚到 ${targetVersionID}`,
      metrics: target.metrics,
      parentVersionID: targetVersionID,
      rollbackOfVersionID: active?.weightVersionID,
      now,
    });
    return this.publish(rollback.weightVersionID);
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

interface RankingWeightRow {
  weight_version_id: string;
  weights_json: string;
  training_sample_count: number;
  update_reason: string;
  rollback_of_version_id: string | null;
  parent_version_id: string | null;
  metrics_json: string;
  is_active: number;
  created_at: string;
}

function decode(row: RankingWeightRow): RankingWeightVersionRecord {
  const weights = JSON.parse(row.weights_json) as RankingWeights;
  assertValidWeights(weights);
  let metrics: Readonly<Record<string, unknown>> = {};
  try {
    const parsed = JSON.parse(row.metrics_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      metrics = parsed as Readonly<Record<string, unknown>>;
    }
  } catch {
    metrics = {};
  }
  return {
    weightVersionID: row.weight_version_id,
    weights,
    trainingSampleCount: row.training_sample_count,
    updateReason: row.update_reason,
    ...(row.rollback_of_version_id
      ? { rollbackOfVersionID: row.rollback_of_version_id }
      : {}),
    ...(row.parent_version_id
      ? { parentVersionID: row.parent_version_id }
      : {}),
    metrics,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
  };
}

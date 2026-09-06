import type {
  FeedbackEventDraft,
  RecommendationFeedbackAction,
} from "../../domain/feedback/feedbackPolicy.ts";
import { isTrainingSignal } from "../../domain/feedback/feedbackPolicy.ts";
import type {
  FeedbackTrainingSample,
  RankingFeatureVector,
} from "../../domain/feedback/logisticWeightLearner.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export interface FeedbackEventRecord extends FeedbackEventDraft {
  readonly inserted: boolean;
}

export class FeedbackRepository {
  readonly #database: PluginDatabase;

  constructor(database: PluginDatabase) {
    this.#database = database;
  }

  async record(draft: FeedbackEventDraft): Promise<FeedbackEventRecord> {
    const connection = this.connection();
    await connection.queryAsync(
      `INSERT OR IGNORE INTO feedback_events (
        event_id, idempotency_key, arxiv_id, event_type, reason_code,
        target_collection_key, profile_lineage_id, run_id, candidate_rank,
        context_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        draft.eventID,
        draft.idempotencyKey,
        draft.arxivID,
        draft.action,
        reasonFor(draft.action),
        draft.targetCollectionKey ?? null,
        draft.profileLineageIDs?.[0] ?? null,
        draft.runID,
        draft.candidateRank ?? null,
        JSON.stringify({
          profileLineageIDs: draft.profileLineageIDs ?? [],
          score: draft.score ?? null,
          zoteroItemKey: draft.zoteroItemKey ?? null,
        }),
        draft.occurredAt,
      ],
    );
    const count = await connection.valueQueryAsync(
      "SELECT COUNT(*) FROM feedback_events WHERE idempotency_key = ?",
      draft.idempotencyKey,
    );
    return { ...draft, inserted: Number(count) === 1 };
  }

  async listForCandidate(
    arxivID: string,
  ): Promise<readonly FeedbackEventRecord[]> {
    const rows = (await this.connection().queryAsync(
      `SELECT event_id, idempotency_key, arxiv_id, event_type, target_collection_key,
              profile_lineage_id, run_id, candidate_rank, context_json, created_at
       FROM feedback_events WHERE arxiv_id = ? ORDER BY created_at DESC`,
      arxivID,
    )) as
      | {
          event_id: string;
          idempotency_key: string;
          arxiv_id: string;
          event_type: RecommendationFeedbackAction;
          target_collection_key: string | null;
          profile_lineage_id: string | null;
          run_id: string | null;
          candidate_rank: number | null;
          context_json: string;
          created_at: string;
        }[]
      | undefined;
    return (rows ?? []).map((row) => {
      const context = JSON.parse(row.context_json) as {
        profileLineageIDs?: readonly string[];
        score?: number;
        zoteroItemKey?: string;
      };
      return {
        eventID: row.event_id,
        idempotencyKey: row.idempotency_key,
        arxivID: row.arxiv_id,
        action: row.event_type,
        profileLineageIDs:
          context.profileLineageIDs ??
          (row.profile_lineage_id ? [row.profile_lineage_id] : []),
        ...(context.score === undefined || context.score === null
          ? {}
          : { score: context.score }),
        ...(row.candidate_rank === null
          ? {}
          : { candidateRank: row.candidate_rank }),
        ...(row.target_collection_key
          ? { targetCollectionKey: row.target_collection_key }
          : {}),
        ...(context.zoteroItemKey
          ? { zoteroItemKey: context.zoteroItemKey }
          : {}),
        runID: row.run_id ?? "unknown",
        occurredAt: row.created_at,
        inserted: true,
      };
    });
  }

  async listTrainingSamples(): Promise<readonly FeedbackTrainingSample[]> {
    const rows = (await this.connection().queryAsync(
      `SELECT f.event_type, f.created_at, c.score_components_json
       FROM feedback_events f
       INNER JOIN recommendation_candidates c
         ON c.run_id = f.run_id AND c.arxiv_id = f.arxiv_id
       WHERE f.event_type IN ('saved', 'rejected-topic')
       ORDER BY f.created_at ASC, f.event_id ASC`,
    )) as
      | {
          event_type: RecommendationFeedbackAction;
          created_at: string;
          score_components_json: string;
        }[]
      | undefined;
    const samples: FeedbackTrainingSample[] = [];
    for (const row of rows ?? []) {
      if (!isTrainingSignal(row.event_type)) continue;
      const features = parseTrainingFeatures(row.score_components_json);
      if (!features) continue;
      samples.push({
        action: row.event_type,
        features,
        occurredAt: row.created_at,
      });
    }
    return samples;
  }

  async listSuppressions(): Promise<
    readonly {
      readonly arxivId: string;
      readonly kind: "saved" | "rejected-topic" | "deferred";
      readonly occurredAt: string;
    }[]
  > {
    const rows = (await this.connection().queryAsync(
      `SELECT arxiv_id, event_type, created_at FROM feedback_events
       WHERE event_type IN ('saved', 'rejected-topic', 'deferred')
       ORDER BY created_at ASC, event_id ASC`,
    )) as
      | {
          arxiv_id: string;
          event_type: "saved" | "rejected-topic" | "deferred";
          created_at: string;
        }[]
      | undefined;
    return (rows ?? []).map((row) => ({
      arxivId: row.arxiv_id,
      kind: row.event_type,
      occurredAt: row.created_at,
    }));
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.#database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

function parseTrainingFeatures(
  value: string,
): RankingFeatureVector | undefined {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const keys = [
      "recentSimilarity",
      "longTermSimilarity",
      "representativeSimilarity",
      "keywordMatch",
      "manualPriority",
      "negativeSimilarity",
    ] as const;
    if (!keys.every((key) => typeof parsed[key] === "number")) return undefined;
    return {
      recentSimilarity: parsed.recentSimilarity as number,
      longTermSimilarity: parsed.longTermSimilarity as number,
      representativeSimilarity: parsed.representativeSimilarity as number,
      keywordMatch: parsed.keywordMatch as number,
      manualPriority: parsed.manualPriority as number,
      negativeSimilarity: parsed.negativeSimilarity as number,
    };
  } catch {
    return undefined;
  }
}

function reasonFor(action: RecommendationFeedbackAction): string | null {
  return action === "rejected-topic" ? "topic-not-relevant" : null;
}

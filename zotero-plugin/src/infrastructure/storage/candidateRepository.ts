import type { ArxivCandidate } from "../../domain/model.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export interface StoredCandidate extends ArxivCandidate {
  readonly profileScores: Readonly<Record<string, number>>;
  readonly scoreComponents: Readonly<Record<string, number>>;
  readonly explainability?: CandidateExplainability;
  readonly finalScore: number;
  readonly rank: number;
  readonly displayStatus?: string;
}

export class CandidateRepository {
  constructor(
    private readonly database: PluginDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async saveRunCandidates(
    runID: string,
    candidates: readonly StoredCandidate[],
  ): Promise<void> {
    const connection = this.connection();
    await connection.executeTransaction(async () => {
      for (const candidate of candidates) {
        await connection.queryAsync(
          `INSERT OR REPLACE INTO recommendation_candidates (
            run_id, arxiv_id, title, authors_json, abstract, categories_json,
            published_at, updated_at, pdf_url, profile_scores_json,
            score_components_json, explainability_json, final_score, rank,
            display_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runID,
            candidate.arxivId,
            candidate.title,
            JSON.stringify(candidate.authors),
            candidate.abstract,
            JSON.stringify(candidate.categories),
            candidate.submittedAt,
            candidate.updatedAt ?? null,
            candidate.pdfUrl,
            JSON.stringify(candidate.profileScores),
            JSON.stringify(candidate.scoreComponents),
            JSON.stringify(candidate.explainability ?? {}),
            candidate.finalScore,
            candidate.rank,
            candidate.displayStatus ?? "new",
          ],
        );
      }
      await connection.queryAsync(
        "UPDATE recommendation_runs SET candidate_count = ? WHERE run_id = ?",
        [candidates.length, runID],
      );
    });
  }

  async listRunCandidates(runID: string): Promise<readonly StoredCandidate[]> {
    const rows = (await this.connection().queryAsync(
      `SELECT arxiv_id, title, authors_json, abstract, categories_json,
              published_at, updated_at, pdf_url, profile_scores_json,
              score_components_json, explainability_json, final_score, rank,
              display_status
       FROM recommendation_candidates WHERE run_id = ? ORDER BY rank, arxiv_id`,
      runID,
    )) as CandidateRow[] | undefined;
    return (rows ?? []).map(decodeCandidate);
  }

  async listRecommendedArxivIDsSince(
    since: string,
  ): Promise<readonly string[]> {
    const rows = (await this.connection().queryAsync(
      `SELECT DISTINCT candidates.arxiv_id
       FROM recommendation_candidates AS candidates
       INNER JOIN recommendation_runs AS runs ON runs.run_id = candidates.run_id
       WHERE runs.status = 'published' AND runs.created_at >= ?
       ORDER BY candidates.arxiv_id`,
      since,
    )) as { arxiv_id: string }[] | undefined;
    return (rows ?? [])
      .map((row) => row.arxiv_id)
      .filter((arxivID) => typeof arxivID === "string" && arxivID.length > 0);
  }

  async pruneCandidateVectors(
    options: {
      readonly generationID?: string;
      readonly maxAgeDays?: number;
      readonly maxBytes?: number;
    } = {},
  ): Promise<number> {
    const connection = this.connection();
    const cutoff = new Date(
      this.now().getTime() - (options.maxAgeDays ?? 14) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const generationClause = options.generationID
      ? " AND generation_id = ?"
      : "";
    const generationParams = options.generationID ? [options.generationID] : [];
    await connection.queryAsync(
      `DELETE FROM embedding_cache
       WHERE object_type = 'arxiv-candidate' AND last_accessed_at < ?${generationClause}`,
      [cutoff, ...generationParams],
    );
    const maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
    let removed = 0;
    while (
      Number(
        await connection.valueQueryAsync(
          `SELECT COALESCE(SUM(size_bytes), 0) FROM embedding_cache
       WHERE object_type = 'arxiv-candidate'${generationClause}`,
          generationParams,
        ),
      ) > maxBytes
    ) {
      const oldest = (await connection.rowQueryAsync(
        `SELECT object_id, content_hash, generation_id FROM embedding_cache
         WHERE object_type = 'arxiv-candidate'${generationClause}
         ORDER BY last_accessed_at ASC LIMIT 1`,
        generationParams,
      )) as
        | { object_id: string; content_hash: string; generation_id: string }
        | false;
      if (!oldest) break;
      await connection.queryAsync(
        `DELETE FROM embedding_cache
         WHERE object_type = 'arxiv-candidate' AND object_id = ?
           AND content_hash = ? AND generation_id = ?`,
        [oldest.object_id, oldest.content_hash, oldest.generation_id],
      );
      removed += 1;
    }
    return removed;
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

interface CandidateRow {
  arxiv_id: string;
  title: string;
  authors_json: string;
  abstract: string;
  categories_json: string;
  published_at: string;
  updated_at: string | null;
  pdf_url: string;
  profile_scores_json: string;
  score_components_json: string;
  explainability_json: string;
  final_score: number;
  rank: number;
  display_status: string;
}

function decodeCandidate(row: CandidateRow): StoredCandidate {
  return {
    arxivId: row.arxiv_id,
    version: 1,
    title: row.title,
    authors: parseStringArray(row.authors_json),
    abstract: row.abstract,
    categories: parseStringArray(row.categories_json),
    submittedAt: row.published_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    abstractUrl: `https://arxiv.org/abs/${row.arxiv_id}`,
    pdfUrl: row.pdf_url,
    profileScores: parseNumberRecord(row.profile_scores_json),
    scoreComponents: parseNumberRecord(row.score_components_json),
    explainability: parseExplainability(row.explainability_json),
    finalScore: Number(row.final_score),
    rank: Number(row.rank),
    displayStatus: row.display_status,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseNumberRecord(value: string): Readonly<Record<string, number>> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isFinite(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export interface CandidateExplainability {
  readonly matchedKeywords?: readonly string[];
  readonly representativeMatches?: readonly {
    readonly itemKey: string;
    readonly title: string;
    readonly similarity: number;
  }[];
  readonly matchedProfileID?: string;
  readonly matchedProfileName?: string;
}

function parseExplainability(value: string): CandidateExplainability {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const matchedKeywords = Array.isArray(parsed.matchedKeywords)
      ? parsed.matchedKeywords.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : undefined;
    const representativeMatches = Array.isArray(parsed.representativeMatches)
      ? parsed.representativeMatches.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const value = entry as Record<string, unknown>;
          return typeof value.itemKey === "string" &&
            typeof value.title === "string" &&
            typeof value.similarity === "number" &&
            Number.isFinite(value.similarity)
            ? [
                {
                  itemKey: value.itemKey,
                  title: value.title,
                  similarity: value.similarity,
                },
              ]
            : [];
        })
      : undefined;
    return {
      ...(matchedKeywords ? { matchedKeywords } : {}),
      ...(representativeMatches ? { representativeMatches } : {}),
      ...(typeof parsed.matchedProfileID === "string"
        ? { matchedProfileID: parsed.matchedProfileID }
        : {}),
      ...(typeof parsed.matchedProfileName === "string"
        ? { matchedProfileName: parsed.matchedProfileName }
        : {}),
    };
  } catch {
    return {};
  }
}

import type {
  BuiltProfile,
  ProfileBuildResult,
} from "../../domain/profiles/profileBuilder.ts";
import type { ZoteroPaper } from "../../domain/model.ts";
import {
  decodeFloat32Vector,
  encodeFloat32Vector,
  parseJsonObject,
} from "./schema.ts";
import type { PluginDatabase } from "./pluginDatabase.ts";

export interface ProfileRepositoryOptions {
  readonly now?: () => Date;
}

export class ProfileRepository {
  private readonly now: () => Date;

  constructor(
    private readonly database: PluginDatabase,
    options: ProfileRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async saveDraft(
    build: ProfileBuildResult,
    generationID: string,
    snapshots: readonly ZoteroPaper[] = [],
  ): Promise<void> {
    const connection = this.connection();
    await connection.executeTransaction(async () => {
      await this.saveSnapshots(snapshots);
      const parentVersion = await connection.valueQueryAsync(
        "SELECT profile_version_id FROM profile_versions WHERE status = 'published' ORDER BY created_at DESC LIMIT 1",
      );
      await connection.queryAsync(
        `INSERT INTO profile_versions (
          profile_version_id, corpus_fingerprint, algorithm_config_json,
          generation_id, creation_reason, status, parent_version_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          build.versionId,
          build.corpusFingerprint,
          JSON.stringify(build.algorithmConfig),
          generationID,
          build.creationReason,
          "draft",
          parentVersion === false ? null : String(parentVersion),
          build.createdAt,
        ],
      );
      for (const [sortOrder, profile] of build.profiles.entries()) {
        await this.saveProfile(profile, sortOrder);
      }
    });
  }

  async publish(versionID: string): Promise<void> {
    const connection = this.connection();
    await connection.executeTransaction(async () => {
      const exists = await connection.valueQueryAsync(
        "SELECT 1 FROM profile_versions WHERE profile_version_id = ?",
        versionID,
      );
      if (exists === false)
        throw new Error(`Unknown profile version ${versionID}`);
      await connection.queryAsync(
        "UPDATE profile_versions SET status = 'archived' WHERE status = 'published'",
      );
      await connection.queryAsync(
        "UPDATE profile_versions SET status = 'published' WHERE profile_version_id = ?",
        versionID,
      );
    });
  }

  async getPublishedVersionID(): Promise<string | undefined> {
    const value = await this.connection().valueQueryAsync(
      `SELECT profile_version_id FROM profile_versions
       WHERE status = 'published' ORDER BY created_at DESC LIMIT 1`,
    );
    return value === false ? undefined : String(value);
  }

  async listVersions(): Promise<readonly ProfileVersionSummary[]> {
    const rows = (await this.connection().queryAsync(
      `SELECT profile_version_id, generation_id, status, created_at
       FROM profile_versions ORDER BY created_at DESC, profile_version_id DESC`,
    )) as
      | {
          profile_version_id: string;
          generation_id: string;
          status: "draft" | "published" | "archived";
          created_at: string;
        }[]
      | undefined;
    return (rows ?? []).map((row) => ({
      versionID: row.profile_version_id,
      generationID: row.generation_id,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async getPublished(): Promise<PublishedProfileSnapshot | undefined> {
    const connection = this.connection();
    const version = (await connection.rowQueryAsync(
      `SELECT profile_version_id, generation_id, created_at
       FROM profile_versions WHERE status = 'published'
       ORDER BY created_at DESC LIMIT 1`,
    )) as
      | {
          profile_version_id: string;
          generation_id: string;
          created_at: string;
        }
      | false;
    if (!version) return undefined;
    const rows = (await connection.queryAsync(
      `SELECT p.profile_id, p.lineage_id, p.profile_type, p.system_name,
              p.centroid, p.statistics_json, p.priority, p.sort_order,
              o.user_name, o.keywords_json, o.locked, o.disabled
       FROM profiles p LEFT JOIN profile_overlays o
         ON o.lineage_id = p.lineage_id
       WHERE p.profile_version_id = ?
       ORDER BY p.sort_order, p.lineage_id`,
      version.profile_version_id,
    )) as ProfileRow[] | undefined;
    const profiles = [];
    for (const row of rows ?? []) {
      const members = (await connection.queryAsync(
        `SELECT item_key, similarity, representative_rank FROM profile_members
         WHERE profile_id = ? ORDER BY representative_rank, item_key`,
        row.profile_id,
      )) as
        | {
            item_key: string;
            similarity: number;
            representative_rank: number | null;
          }[]
        | undefined;
      const statistics = parseJsonObject(
        row.statistics_json,
        "profile.statistics_json",
      );
      const representativeItemKeys =
        Array.isArray(statistics.representativeItemKeys) &&
        statistics.representativeItemKeys.every(
          (value): value is string => typeof value === "string",
        )
          ? statistics.representativeItemKeys
          : (members ?? [])
              .filter((member) => member.representative_rank !== null)
              .sort(
                (left, right) =>
                  (left.representative_rank ?? 0) -
                    (right.representative_rank ?? 0) ||
                  left.item_key.localeCompare(right.item_key),
              )
              .map((member) => member.item_key);
      const keywords =
        Array.isArray(statistics.keywords) &&
        statistics.keywords.every(
          (value): value is string => typeof value === "string",
        )
          ? statistics.keywords
          : [];
      const overlayKeywords = parseOptionalStringArray(row.keywords_json);
      profiles.push({
        id: row.profile_id,
        lineageId: row.lineage_id,
        versionId: version.profile_version_id,
        horizon: row.profile_type,
        name: row.user_name?.trim() || row.system_name,
        keywords: overlayKeywords.length ? overlayKeywords : keywords,
        centroid: decodeFloat32Vector(row.centroid),
        representativeItemKeys,
        memberCount: Number(statistics.memberCount ?? members?.length ?? 0),
        confidence: numberMetric(statistics.meanIntraclusterSimilarity),
        stability: numberMetric(statistics.versionOverlap),
        collectionShare: numberMetric(statistics.primaryCollectionShare),
        ...(typeof statistics.primaryCollectionKey === "string"
          ? { primaryCollectionKey: statistics.primaryCollectionKey }
          : {}),
        weight: Number(row.priority),
        locked: row.locked === 1,
        disabled: row.disabled === 1,
        memberItemKeys: (members ?? []).map((member) => member.item_key),
        memberSimilarities: Object.fromEntries(
          (members ?? []).map((member) => [
            member.item_key,
            Number(member.similarity),
          ]),
        ),
      });
    }
    return {
      versionID: version.profile_version_id,
      generationID: version.generation_id,
      createdAt: version.created_at,
      profiles,
    };
  }

  async pruneOldVersions(
    keep = 20,
    protectedVersionIDs: readonly string[] = [],
  ): Promise<number> {
    const connection = this.connection();
    const rows = (await connection.queryAsync(
      `SELECT profile_version_id FROM profile_versions
       ORDER BY created_at DESC, profile_version_id DESC`,
    )) as { profile_version_id: string }[] | undefined;
    const protectedIDs = new Set(protectedVersionIDs);
    const keepIDs = new Set<string>();
    let retainedUnprotected = 0;
    for (const row of rows ?? []) {
      if (protectedIDs.has(row.profile_version_id)) {
        keepIDs.add(row.profile_version_id);
      } else if (retainedUnprotected < Math.max(0, keep)) {
        keepIDs.add(row.profile_version_id);
        retainedUnprotected += 1;
      }
    }
    let deleted = 0;
    for (const row of rows ?? []) {
      if (
        keepIDs.has(row.profile_version_id) ||
        protectedIDs.has(row.profile_version_id)
      ) {
        continue;
      }
      const references = await connection.valueQueryAsync(
        `SELECT 1 FROM recommendation_runs WHERE profile_version_id = ? LIMIT 1`,
        row.profile_version_id,
      );
      const children = await connection.valueQueryAsync(
        `SELECT 1 FROM profile_versions WHERE parent_version_id = ? LIMIT 1`,
        row.profile_version_id,
      );
      if (references !== false || children !== false) continue;
      await connection.queryAsync(
        "DELETE FROM profile_versions WHERE profile_version_id = ?",
        row.profile_version_id,
      );
      deleted += 1;
    }
    return deleted;
  }

  async rollback(versionID: string): Promise<void> {
    await this.publish(versionID);
  }

  private async saveSnapshots(
    snapshots: readonly ZoteroPaper[],
  ): Promise<void> {
    const connection = this.connection();
    for (const paper of snapshots) {
      await connection.queryAsync(
        `INSERT OR REPLACE INTO item_snapshots (
          library_id, item_key, item_version, content_hash, date_added,
          collections_fingerprint, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          paper.libraryId,
          paper.itemKey,
          paper.itemVersion,
          `${paper.itemVersion}:${paper.title}:${paper.abstract}`,
          paper.dateAdded,
          JSON.stringify(paper.collectionKeys),
          this.now().toISOString(),
        ],
      );
    }
  }

  private async saveProfile(
    profile: BuiltProfile,
    sortOrder: number,
  ): Promise<void> {
    const connection = this.connection();
    await connection.queryAsync(
      `INSERT INTO profiles (
        profile_id, profile_version_id, lineage_id, profile_type, system_name,
        centroid, statistics_json, priority, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        profile.versionId,
        profile.lineageId,
        profile.horizon,
        profile.name,
        encodeFloat32Vector(profile.centroid),
        JSON.stringify({
          ...profile.metrics,
          keywords: profile.keywords,
          representativeItemKeys: profile.representativeItemKeys,
        }),
        profile.weight,
        sortOrder,
      ],
    );
    for (const itemKey of profile.memberItemKeys) {
      const paper = await connection.valueQueryAsync(
        "SELECT library_id FROM item_snapshots WHERE item_key = ? LIMIT 1",
        itemKey,
      );
      if (paper === false) continue;
      await connection.queryAsync(
        `INSERT INTO profile_members (
          profile_id, library_id, item_key, similarity, representative_rank
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          profile.id,
          Number(paper),
          itemKey,
          profile.memberSimilarities[itemKey] ?? 0,
          profile.representativeItemKeys.indexOf(itemKey) + 1 || null,
        ],
      );
    }
  }

  private connection(): NonNullable<PluginDatabase["connection"]> {
    const connection = this.database.connection;
    if (!connection) throw new Error("Plugin database is not open");
    return connection;
  }
}

export interface PublishedProfileSnapshot {
  readonly versionID: string;
  readonly generationID: string;
  readonly createdAt: string;
  readonly profiles: readonly PublishedProfile[];
}

export interface ProfileVersionSummary {
  readonly versionID: string;
  readonly generationID: string;
  readonly status: "draft" | "published" | "archived";
  readonly createdAt: string;
}

export type PublishedProfile =
  import("../../domain/model.ts").InterestProfile & {
    readonly memberItemKeys: readonly string[];
    readonly memberSimilarities: Readonly<Record<string, number>>;
    readonly primaryCollectionKey?: string;
    readonly confidence: number;
    readonly stability: number;
    readonly collectionShare: number;
  };

interface ProfileRow {
  profile_id: string;
  lineage_id: string;
  profile_type: import("../../domain/model.ts").ProfileHorizon;
  system_name: string;
  centroid: Uint8Array | ArrayBuffer | readonly number[] | string;
  statistics_json: string;
  priority: number;
  sort_order: number;
  user_name: string | null;
  keywords_json: string | null;
  locked: number | null;
  disabled: number | null;
}

function parseOptionalStringArray(value: string | null): readonly string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function numberMetric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

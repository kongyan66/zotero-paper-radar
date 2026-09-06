export const DATABASE_NAME = "zotero-arxiv-daily";
export const CURRENT_SCHEMA_VERSION = 5;

export const INITIAL_TABLE_NAMES = [
  "schema_meta",
  "item_snapshots",
  "corpus_dirty_items",
  "embedding_generations",
  "embedding_cache",
  "profile_versions",
  "profiles",
  "profile_members",
  "profile_overlays",
  "recommendation_runs",
  "recommendation_candidates",
  "summary_cache",
  "feedback_events",
  "ranking_weight_versions",
  "operation_tasks",
  "import_tasks",
] as const;

export const INITIAL_INDEX_NAMES = [
  "idx_embedding_generations_model",
  "idx_corpus_dirty_items_updated",
  "idx_embedding_cache_generation",
  "idx_embedding_cache_lru",
  "idx_profile_versions_generation",
  "idx_profile_versions_status",
  "idx_profiles_lineage",
  "idx_profiles_version",
  "idx_profile_members_item",
  "idx_recommendation_runs_created",
  "idx_recommendation_runs_profile_version",
  "idx_recommendation_candidates_arxiv",
  "idx_recommendation_candidates_run_rank",
  "idx_summary_cache_version",
  "idx_ranking_weight_active",
  "idx_feedback_events_idempotency",
  "idx_feedback_events_profile",
  "idx_feedback_events_arxiv",
  "idx_operation_tasks_status",
  "idx_operation_tasks_type_status",
  "idx_operation_tasks_related_run",
  "idx_import_tasks_stable_intent",
  "idx_import_tasks_arxiv",
  "idx_import_tasks_core_status",
  "idx_import_tasks_attachment_status",
] as const;

export type JsonObject = Readonly<Record<string, unknown>>;

export function parseJsonObject(value: string, fieldName: string): JsonObject {
  const parsed = parseJson(value, fieldName);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must contain a JSON object`);
  }
  return parsed as JsonObject;
}

export function parseJsonArray(
  value: string,
  fieldName: string,
): readonly unknown[] {
  const parsed = parseJson(value, fieldName);
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must contain a JSON array`);
  }
  return parsed;
}

function parseJson(value: string, fieldName: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON in ${fieldName}`, { cause: error });
  }
}

export function encodeFloat32Vector(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      throw new Error(`Vector value at index ${index} must be finite`);
    }
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, value, true);
    if (
      !Number.isFinite(
        view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true),
      )
    ) {
      throw new Error(`Vector value at index ${index} exceeds Float32 range`);
    }
  });
  return bytes;
}

export function decodeFloat32Vector(
  value: Uint8Array | ArrayBuffer | readonly number[] | string,
): number[] {
  const bytes = coerceBlobBytes(value);
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Vector blob length must be a multiple of 4 bytes");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values: number[] = [];
  for (
    let offset = 0;
    offset < bytes.byteLength;
    offset += Float32Array.BYTES_PER_ELEMENT
  ) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value)) {
      throw new Error(`Vector blob contains a non-finite value at ${offset}`);
    }
    values.push(value);
  }
  return values;
}

function coerceBlobBytes(
  value: Uint8Array | ArrayBuffer | readonly number[] | string,
): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") {
    return Uint8Array.from(
      value,
      (character) => character.charCodeAt(0) & 0xff,
    );
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error("Unsupported vector blob representation");
}

export const INITIAL_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS schema_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_migration_at TEXT,
    last_migration_name TEXT,
    migration_status TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO schema_meta (
    id, schema_version, created_at, migration_status
  ) VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 'migrating')`,
  `CREATE TABLE IF NOT EXISTS item_snapshots (
    library_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    item_version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    date_added TEXT NOT NULL,
    collections_fingerprint TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (library_id, item_key)
  )`,
  `CREATE TABLE IF NOT EXISTS corpus_dirty_items (
    entity_type TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    event_type TEXT NOT NULL,
    item_type TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_key)
  )`,
  `CREATE TABLE IF NOT EXISTS embedding_generations (
    generation_id TEXT PRIMARY KEY,
    base_url_hash TEXT NOT NULL,
    model_name TEXT NOT NULL,
    vector_dimensions INTEGER NOT NULL CHECK (vector_dimensions > 0),
    normalization_version TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS embedding_cache (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    generation_id TEXT NOT NULL,
    vector BLOB NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    PRIMARY KEY (object_type, object_id, content_hash, generation_id),
    FOREIGN KEY (generation_id) REFERENCES embedding_generations(generation_id)
  )`,
  `CREATE TABLE IF NOT EXISTS profile_versions (
    profile_version_id TEXT PRIMARY KEY,
    corpus_fingerprint TEXT NOT NULL,
    algorithm_config_json TEXT NOT NULL,
    generation_id TEXT NOT NULL,
    creation_reason TEXT NOT NULL,
    status TEXT NOT NULL,
    parent_version_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (generation_id) REFERENCES embedding_generations(generation_id),
    FOREIGN KEY (parent_version_id) REFERENCES profile_versions(profile_version_id)
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    profile_id TEXT PRIMARY KEY,
    profile_version_id TEXT NOT NULL,
    lineage_id TEXT NOT NULL,
    profile_type TEXT NOT NULL,
    system_name TEXT NOT NULL,
    centroid BLOB NOT NULL,
    statistics_json TEXT NOT NULL,
    priority REAL NOT NULL,
    sort_order INTEGER NOT NULL,
    UNIQUE (profile_version_id, lineage_id),
    FOREIGN KEY (profile_version_id) REFERENCES profile_versions(profile_version_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS profile_members (
    profile_id TEXT NOT NULL,
    library_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    similarity REAL NOT NULL,
    representative_rank INTEGER,
    PRIMARY KEY (profile_id, library_id, item_key),
    FOREIGN KEY (profile_id) REFERENCES profiles(profile_id) ON DELETE CASCADE,
    FOREIGN KEY (library_id, item_key) REFERENCES item_snapshots(library_id, item_key)
  )`,
  `CREATE TABLE IF NOT EXISTS profile_overlays (
    lineage_id TEXT PRIMARY KEY,
    user_name TEXT,
    keywords_json TEXT NOT NULL DEFAULT '[]',
    weight REAL NOT NULL DEFAULT 1,
    locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
    include_item_keys_json TEXT NOT NULL DEFAULT '[]',
    exclude_item_keys_json TEXT NOT NULL DEFAULT '[]',
    structure_operations_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ranking_weight_versions (
    weight_version_id TEXT PRIMARY KEY,
    weights_json TEXT NOT NULL,
    training_sample_count INTEGER NOT NULL DEFAULT 0,
    update_reason TEXT NOT NULL,
    rollback_of_version_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (rollback_of_version_id) REFERENCES ranking_weight_versions(weight_version_id)
  )`,
  `CREATE TABLE IF NOT EXISTS recommendation_runs (
    run_id TEXT PRIMARY KEY,
    query_scope_json TEXT NOT NULL,
    target_profile_ids_json TEXT NOT NULL,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    stage_timings_json TEXT NOT NULL DEFAULT '{}',
    generation_id TEXT NOT NULL,
    profile_version_id TEXT NOT NULL,
    weight_version_id TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (generation_id) REFERENCES embedding_generations(generation_id),
    FOREIGN KEY (profile_version_id) REFERENCES profile_versions(profile_version_id),
    FOREIGN KEY (weight_version_id) REFERENCES ranking_weight_versions(weight_version_id)
  )`,
  `CREATE TABLE IF NOT EXISTS recommendation_candidates (
    run_id TEXT NOT NULL,
    arxiv_id TEXT NOT NULL,
    title TEXT NOT NULL,
    authors_json TEXT NOT NULL,
    abstract TEXT NOT NULL,
    categories_json TEXT NOT NULL,
    published_at TEXT NOT NULL,
    updated_at TEXT,
    pdf_url TEXT NOT NULL,
    profile_scores_json TEXT NOT NULL,
    score_components_json TEXT NOT NULL,
    final_score REAL NOT NULL,
    rank INTEGER NOT NULL,
    display_status TEXT NOT NULL,
    PRIMARY KEY (run_id, arxiv_id),
    FOREIGN KEY (run_id) REFERENCES recommendation_runs(run_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS summary_cache (
    arxiv_id TEXT NOT NULL,
    llm_model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    language TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (arxiv_id, llm_model, prompt_version, language)
  )`,
  `CREATE TABLE IF NOT EXISTS feedback_events (
    event_id TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    arxiv_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    reason_code TEXT,
    target_collection_key TEXT,
    profile_lineage_id TEXT,
    run_id TEXT,
    candidate_rank INTEGER,
    context_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES recommendation_runs(run_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operation_tasks (
    task_id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL,
    stage TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    checkpoint_json TEXT NOT NULL DEFAULT '{}',
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    related_run_id TEXT,
    related_domain_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    FOREIGN KEY (related_run_id) REFERENCES recommendation_runs(run_id)
  )`,
  `CREATE TABLE IF NOT EXISTS import_tasks (
    task_id TEXT PRIMARY KEY,
    stable_intent_key TEXT NOT NULL,
    arxiv_id TEXT NOT NULL,
    core_status TEXT NOT NULL,
    attachment_status TEXT NOT NULL,
    zotero_item_key TEXT,
    target_collection_key TEXT,
    feedback_event_id TEXT,
    error_code TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES operation_tasks(task_id) ON DELETE CASCADE,
    FOREIGN KEY (feedback_event_id) REFERENCES feedback_events(event_id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_embedding_generations_model ON embedding_generations(model_name, normalization_version, status)",
  "CREATE INDEX IF NOT EXISTS idx_corpus_dirty_items_updated ON corpus_dirty_items(updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_embedding_cache_generation ON embedding_cache(generation_id, object_type)",
  "CREATE INDEX IF NOT EXISTS idx_embedding_cache_lru ON embedding_cache(object_type, last_accessed_at)",
  "CREATE INDEX IF NOT EXISTS idx_profile_versions_generation ON profile_versions(generation_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_profile_versions_status ON profile_versions(status, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_profiles_lineage ON profiles(lineage_id, profile_version_id)",
  "CREATE INDEX IF NOT EXISTS idx_profiles_version ON profiles(profile_version_id, sort_order)",
  "CREATE INDEX IF NOT EXISTS idx_profile_members_item ON profile_members(library_id, item_key)",
  "CREATE INDEX IF NOT EXISTS idx_recommendation_runs_created ON recommendation_runs(created_at, status)",
  "CREATE INDEX IF NOT EXISTS idx_recommendation_runs_profile_version ON recommendation_runs(profile_version_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_recommendation_candidates_arxiv ON recommendation_candidates(arxiv_id)",
  "CREATE INDEX IF NOT EXISTS idx_recommendation_candidates_run_rank ON recommendation_candidates(run_id, rank)",
  "CREATE INDEX IF NOT EXISTS idx_ranking_weight_active ON ranking_weight_versions(is_active, created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_events_idempotency ON feedback_events(idempotency_key)",
  "CREATE INDEX IF NOT EXISTS idx_feedback_events_profile ON feedback_events(profile_lineage_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_feedback_events_arxiv ON feedback_events(arxiv_id, created_at)",
  "CREATE INDEX IF NOT EXISTS idx_operation_tasks_status ON operation_tasks(status, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_operation_tasks_type_status ON operation_tasks(task_type, status)",
  "CREATE INDEX IF NOT EXISTS idx_operation_tasks_related_run ON operation_tasks(related_run_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_import_tasks_stable_intent ON import_tasks(stable_intent_key)",
  "CREATE INDEX IF NOT EXISTS idx_import_tasks_arxiv ON import_tasks(arxiv_id, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_import_tasks_core_status ON import_tasks(core_status, updated_at)",
  "CREATE INDEX IF NOT EXISTS idx_import_tasks_attachment_status ON import_tasks(attachment_status, updated_at)",
];

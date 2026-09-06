export type ImportCoreStatus =
  | "queued"
  | "checking-duplicate"
  | "writing-metadata"
  | "classifying"
  | "recording-feedback"
  | "completed"
  | "conflict"
  | "failed";

const TRANSITIONS: Readonly<
  Record<ImportCoreStatus, readonly ImportCoreStatus[]>
> = {
  queued: ["checking-duplicate", "failed"],
  "checking-duplicate": [
    "writing-metadata",
    "classifying",
    "conflict",
    "failed",
  ],
  "writing-metadata": ["classifying", "failed"],
  classifying: ["recording-feedback", "completed", "failed"],
  "recording-feedback": ["completed", "failed"],
  completed: [],
  conflict: [],
  failed: ["checking-duplicate", "writing-metadata", "classifying"],
};

export function canTransition(
  from: ImportCoreStatus,
  to: ImportCoreStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transitionImportState(
  from: ImportCoreStatus,
  to: ImportCoreStatus,
): ImportCoreStatus {
  if (!canTransition(from, to))
    throw new Error(`非法入库状态迁移：${from} -> ${to}`);
  return to;
}

export function stableImportIntentKey(
  arxivID: string,
  intent = "save",
): string {
  const normalized = arxivID.trim().toLowerCase().replace(/v\d+$/, "");
  if (!normalized) throw new Error("arXiv ID 不能为空");
  return `arxiv:${normalized}:${intent.trim() || "save"}`;
}
